const roleCards = document.querySelectorAll(".role-card");
const backdrop = document.querySelector("#backdrop");
const loginPanel = document.querySelector("#loginPanel");
const closeButton = document.querySelector("#closeLogin");
const loginForm = document.querySelector("#loginForm");
const loginTitle = document.querySelector("#loginTitle");
const loginSubtitle = document.querySelector("#loginSubtitle");
const loginEyebrow = document.querySelector("#loginEyebrow");
const loginSymbol = document.querySelector("#loginSymbol");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const formMessage = document.querySelector("#formMessage");
const togglePassword = document.querySelector("#togglePassword");

let selectedRole = null;
let previousFocus = null;

function openLogin(role, card) {
    selectedRole = role;
    previousFocus = card;
    const names = { student: "Student", teacher: "Teacher", admin: "Admin" };
    loginTitle.textContent = `Welcome back, ${names[role]}.`;
    loginSubtitle.textContent = `Sign in to continue to your ${names[role].toLowerCase()} space.`;
    loginEyebrow.textContent = role === "admin" ? "ADMINISTRATION" : "YOUR SPACE AWAITS";
    loginSymbol.textContent = role === "admin" ? "✦" : "✳";
    loginForm.reset();
    passwordInput.type = "password";
    togglePassword.textContent = "Show";
    togglePassword.setAttribute("aria-pressed", "false");
    formMessage.textContent = new URLSearchParams(location.search).has("auth")
        ? "Your sign-in is required to continue."
        : "";
    loginPanel.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add("login-open");
    roleCards.forEach((item) => item.setAttribute("aria-pressed", String(item === card)));
    emailInput.focus();
}

function closeLogin() {
    loginPanel.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("login-open");
    roleCards.forEach((item) => item.setAttribute("aria-pressed", "false"));
    selectedRole = null;
    previousFocus?.focus();
}

roleCards.forEach((card) => card.addEventListener("click", () => openLogin(card.dataset.role, card)));
closeButton.addEventListener("click", closeLogin);
backdrop.addEventListener("click", closeLogin);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !loginPanel.hidden) closeLogin();
});

togglePassword.addEventListener("click", () => {
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    togglePassword.textContent = show ? "Hide" : "Show";
    togglePassword.setAttribute("aria-label", show ? "Hide password" : "Show password");
    togglePassword.setAttribute("aria-pressed", String(show));
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedRole) return;

    const submitButton = loginForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    formMessage.textContent = "Signing in…";
    try {
        await window.LearnSpaceApi.getCsrf();
        const result = await window.LearnSpaceApi.post(`/auth/${selectedRole}/login`, {
            email: emailInput.value.trim(),
            password: passwordInput.value
        });
        const destinations = {
            student: "student_courses.html",
            teacher: "teacher-dashboard.html",
            admin: "admin-dashboard.html"
        };
        window.location.assign(destinations[result.user.role]);
    } catch (error) {
        formMessage.textContent = error.message || "Sign-in failed. Please try again.";
        passwordInput.value = "";
        passwordInput.focus();
    } finally {
        submitButton.disabled = false;
    }
});
