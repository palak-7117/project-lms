
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

let selectedRole = null;
let previousFocus = null;

function openLogin(role, selectedCard) {
    selectedRole = role;
    previousFocus = selectedCard;

    // Update the login text for the selected role.
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

    // Highlight the selected card and dim the other one.
    roleCards.forEach((card) => {
        const isSelected = card === selectedCard;

        card.classList.toggle("is-selected", isSelected);
        card.classList.toggle("is-dimmed", !isSelected);

        card.setAttribute("aria-pressed", String(isSelected));
    });

    // Show the blur and login panel.
    backdrop.hidden = false;
    loginPanel.hidden = false;

    document.body.style.overflow = "hidden";

    // Allow the browser to apply the initial styles before animating.
    requestAnimationFrame(() => {
        backdrop.classList.add("is-visible");
        loginPanel.classList.add("is-visible");
        emailInput.focus();
    });
}

function closeLogin() {
    backdrop.classList.remove("is-visible");
    loginPanel.classList.remove("is-visible");

    roleCards.forEach((card) => {
        card.classList.remove("is-selected", "is-dimmed");
        card.setAttribute("aria-pressed", "false");
    });

    document.body.style.overflow = "";

    // Wait for the exit animation before hiding the elements.
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

// Open the correct login panel when a role card is clicked.
roleCards.forEach((card) => {
    card.setAttribute("aria-pressed", "false");

    card.addEventListener("click", () => {
        if (selectedRole) {
            return;
        }

        openLogin(card.dataset.role, card);
    });
});

// Close the panel with the close button or by clicking outside.
closeButton.addEventListener("click", closeLogin);
backdrop.addEventListener("click", closeLogin);

// Allow Escape to close the panel.
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectedRole) {
        closeLogin();
    }
});

// This is a frontend demo only. No credentials are sent anywhere.
loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    formMessage.textContent =
        `The ${selectedRole} login interface is working! ` +
        "Real authentication will be connected to our backend later.";
});
