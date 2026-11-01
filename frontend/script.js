
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
const formMessage = document.querySelector("#formMessage");

const passwordInput = document.querySelector("#password");
const togglePassword = document.querySelector("#togglePassword");

let selectedRole = null;
let previousFocus = null;

/* ========================================
   OPEN THE ROLE-SPECIFIC LOGIN PANEL
======================================== */

function openLogin(role, selectedCard) {
    selectedRole = role;
    previousFocus = selectedCard;

    // Reset password visibility whenever the panel opens.
    passwordInput.type = "password";
    togglePassword.textContent = "Show";
    togglePassword.setAttribute("aria-label", "Show password");
    togglePassword.setAttribute("aria-pressed", "false");

    loginForm.reset();
    formMessage.textContent = "";

    if (role === "student") {
        loginTitle.textContent = "Welcome, learner.";
        loginSubtitle.textContent =
            "Sign in to access your courses and learning resources.";
        loginEyebrow.textContent = "YOUR LEARNING SPACE";
        loginSymbol.textContent = "✳";
    } else {
        loginTitle.textContent = "Welcome, teacher.";
        loginSubtitle.textContent =
            "Sign in to manage your courses and guide your students.";
        loginEyebrow.textContent = "YOUR TEACHING SPACE";
        loginSymbol.textContent = "✦";
    }

    // Highlight the selected card and dim the other card.
    roleCards.forEach((card) => {
        const isSelected = card === selectedCard;

        card.classList.toggle("is-selected", isSelected);
        card.classList.toggle("is-dimmed", !isSelected);

        card.setAttribute("aria-pressed", String(isSelected));
    });

    // Display the backdrop and login panel.
    backdrop.hidden = false;
    loginPanel.hidden = false;

    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
        backdrop.classList.add("is-visible");
        loginPanel.classList.add("is-visible");
        emailInput.focus();
    });
}

/* ========================================
   CLOSE THE LOGIN PANEL
======================================== */

function closeLogin() {
    if (!selectedRole) {
        return;
    }

    backdrop.classList.remove("is-visible");
    loginPanel.classList.remove("is-visible");

    roleCards.forEach((card) => {
        card.classList.remove("is-selected", "is-dimmed");
        card.setAttribute("aria-pressed", "false");
    });

    document.body.style.overflow = "";

    window.setTimeout(() => {
        backdrop.hidden = true;
        loginPanel.hidden = true;

        if (previousFocus) {
            previousFocus.focus();
        }

        selectedRole = null;
        previousFocus = null;
    }, 320);
}

/* ========================================
   ROLE CARD CLICK EVENTS
======================================== */

roleCards.forEach((card) => {
    card.setAttribute("aria-pressed", "false");

    card.addEventListener("click", () => {
        if (selectedRole) {
            return;
        }

        openLogin(card.dataset.role, card);
    });
});

/* ========================================
   CLOSE BUTTON AND BACKDROP EVENTS
======================================== */

closeButton.addEventListener("click", closeLogin);
backdrop.addEventListener("click", closeLogin);

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectedRole) {
        closeLogin();
    }
});

/* ========================================
   SHOW / HIDE PASSWORD
======================================== */

togglePassword.addEventListener("click", () => {
    const isPasswordHidden = passwordInput.type === "password";

    // Reveal or mask the password.
    passwordInput.type = isPasswordHidden ? "text" : "password";

    // Update the button text.
    togglePassword.textContent = isPasswordHidden ? "Hide" : "Show";

    // Update accessibility information.
    togglePassword.setAttribute(
        "aria-label",
        isPasswordHidden ? "Hide password" : "Show password"
    );

    togglePassword.setAttribute(
        "aria-pressed",
        String(isPasswordHidden)
    );
});

/* ========================================
   FORM SUBMISSION
======================================== */

loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!selectedRole) {
        return;
    }

    if (selectedRole === "student"){
        window.location.href = "student_courses.html";
        return;
    }


    // TEACHER: open the teacher dashboard.
    if (selectedRole === "teacher") {
        window.location.href = "teacher-dashboard.html";
        return;
    }

    // STUDENT: preserve the existing demo behavior.
});
