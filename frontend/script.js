
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

const USER_STORAGE_KEY = "learnspaceUsers";
const STUDENT_STORAGE_KEY = "learnspaceStudents";
const TEACHER_STORAGE_KEY = "learnspaceTeachers";
const SESSION_STORAGE_KEY = "learnspaceSession";

let selectedRole = null;
let previousFocus = null;

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function validateEmailAddress(email) {
    const normalizedEmail = normalizeEmail(email);
    const validator = document.createElement("input");

    validator.type = emailInput.type;
    validator.required = emailInput.required;
    validator.value = normalizedEmail;

    return validator.checkValidity()
        ? { success: true, email: normalizedEmail }
        : { success: false, message: "Enter a valid email address." };
}

function readRecordListSnapshot(storageKey) {
    const storedValue = localStorage.getItem(storageKey);
    if (storedValue === null) {
        return { records: [], rawValue: null };
    }

    const records = JSON.parse(storedValue);
    if (!Array.isArray(records)) {
        throw new Error(`Saved ${storageKey} data is not a list.`);
    }

    return { records, rawValue: storedValue };
}

function validateUserCollection(users) {
    const seenIds = new Set();
    const seenEmails = new Set();
    const allowedRoles = new Set(["student", "teacher", "admin"]);
    const allowedStatuses = new Set(["active", "disabled", "pending"]);

    for (const user of users) {
        if (!user || typeof user !== "object" || Array.isArray(user)) {
            return "Saved user data contains a malformed account record.";
        }

        if (typeof user.id !== "string" || !user.id.trim()) {
            return "A saved account is missing its user ID.";
        }

        if (!allowedRoles.has(user.role)) {
            return `Account ${user.id} has an invalid role.`;
        }

        const emailValidation = validateEmailAddress(user.email);
        if (!emailValidation.success) {
            return `Account ${user.id} has an invalid email address.`;
        }

        if (!allowedStatuses.has(user.accountStatus)) {
            return `Account ${user.id} has an invalid account status.`;
        }

        if (seenIds.has(user.id)) {
            return `Duplicate user ID ${user.id} exists in saved accounts.`;
        }

        if (seenEmails.has(emailValidation.email)) {
            return `Duplicate account email ${emailValidation.email} exists in saved accounts.`;
        }

        seenIds.add(user.id);
        seenEmails.add(emailValidation.email);
    }

    return "";
}

function isValidCreatedAt(value) {
    return typeof value === "string" &&
        value.trim() !== "" &&
        !Number.isNaN(Date.parse(value));
}

function validateProfileCollection(profiles, role, users) {
    const profileIdKey = role === "student" ? "studentId" : "teacherId";
    const seenProfileIds = new Set();
    const seenUserIds = new Set();
    const allowedAdmissionStatuses = new Set([
        "pending",
        "admitted",
        "rejected"
    ]);
    const allowedAuthorizationStatuses = new Set([
        "pending",
        "authorized",
        "revoked"
    ]);

    for (const profile of profiles) {
        if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
            return `Saved ${role} profiles contain a malformed record.`;
        }

        if (typeof profile[profileIdKey] !== "string" ||
            !profile[profileIdKey].trim()) {
            return `A saved ${role} profile is missing ${profileIdKey}.`;
        }

        if (typeof profile.userId !== "string" || !profile.userId.trim()) {
            return `A saved ${role} profile is missing its linked userId.`;
        }

        const linkedUser = users.find((user) => user.id === profile.userId);
        if (!linkedUser || linkedUser.role !== role) {
            return `The ${role} profile ${profile[profileIdKey]} is linked to a missing or different-role user.`;
        }

        if (!isValidCreatedAt(profile.createdAt)) {
            return `The ${role} profile ${profile[profileIdKey]} has an invalid createdAt value.`;
        }

        if (role === "student") {
            if (!allowedAdmissionStatuses.has(profile.admissionStatus)) {
                return `Student profile ${profile.studentId} has an invalid admissionStatus.`;
            }

            if (!allowedAuthorizationStatuses.has(profile.authorizationStatus)) {
                return `Student profile ${profile.studentId} has an invalid authorizationStatus.`;
            }

            if (!Object.prototype.hasOwnProperty.call(profile, "semesterId") ||
                (profile.semesterId !== null &&
                    (typeof profile.semesterId !== "string" ||
                        !profile.semesterId.trim()))) {
                return `Student profile ${profile.studentId} must have a semesterId that is null or a nonempty string.`;
            }
        }

        if (seenProfileIds.has(profile[profileIdKey])) {
            return `Duplicate ${profileIdKey} ${profile[profileIdKey]} exists in saved ${role} profiles.`;
        }

        if (seenUserIds.has(profile.userId)) {
            return `More than one ${role} profile is linked to user ${profile.userId}.`;
        }

        seenProfileIds.add(profile[profileIdKey]);
        seenUserIds.add(profile.userId);
    }

    return "";
}

function findLinkedProfile(role, userId, profiles, users) {
    const validationError = validateProfileCollection(profiles, role, users);
    if (validationError) {
        return { success: false, message: validationError };
    }

    const linkedProfiles = profiles.filter((profile) => profile.userId === userId);
    if (linkedProfiles.length === 0) {
        return {
            success: false,
            message: `This account has no linked ${role} profile. No account or profile data was changed.`
        };
    }

    if (linkedProfiles.length !== 1) {
        return {
            success: false,
            message: `This account has duplicate ${role} profiles. No account or profile data was changed.`
        };
    }

    return { success: true, profile: linkedProfiles[0] };
}

function persistNewDemoAccount(userSnapshot, profileSnapshot, profileKey, user, profile) {
    const nextUsers = [...userSnapshot.records, user];
    const nextProfiles = [...profileSnapshot.records, profile];
    const userValidationError = validateUserCollection(nextUsers);
    if (userValidationError) {
        return { success: false, message: userValidationError };
    }

    const profileValidationError = validateProfileCollection(
        nextProfiles,
        user.role,
        nextUsers
    );

    if (profileValidationError) {
        return { success: false, message: profileValidationError };
    }

    const writes = [
        {
            key: USER_STORAGE_KEY,
            previousValue: userSnapshot.rawValue,
            nextValue: JSON.stringify(nextUsers)
        },
        {
            key: profileKey,
            previousValue: profileSnapshot.rawValue,
            nextValue: JSON.stringify(nextProfiles)
        }
    ];
    const attemptedWrites = [];

    try {
        for (const write of writes) {
            if (localStorage.getItem(write.key) !== write.previousValue) {
                throw new Error(`Saved ${write.key} data changed in another tab.`);
            }

            attemptedWrites.push(write);
            localStorage.setItem(write.key, write.nextValue);

            if (localStorage.getItem(write.key) !== write.nextValue) {
                throw new Error(`Could not verify the saved ${write.key} value.`);
            }
        }
    } catch (error) {
        const rollbackIssues = [];

        for (const write of attemptedWrites.reverse()) {
            try {
                const currentValue = localStorage.getItem(write.key);

                if (currentValue === write.previousValue) {
                    continue;
                }

                if (currentValue !== write.nextValue) {
                    rollbackIssues.push(
                        `${write.key} changed elsewhere and was left untouched`
                    );
                    continue;
                }

                if (write.previousValue === null) {
                    localStorage.removeItem(write.key);
                } else {
                    localStorage.setItem(write.key, write.previousValue);
                }

                if (localStorage.getItem(write.key) !== write.previousValue) {
                    rollbackIssues.push(`${write.key} could not be restored`);
                }
            } catch (rollbackError) {
                rollbackIssues.push(`${write.key} could not be restored`);
            }
        }

        if (rollbackIssues.length) {
            return {
                success: false,
                message: `Account creation failed, and rollback needs attention: ${rollbackIssues.join("; ")}. Check these localStorage keys before retrying.`
            };
        }

        if (error.message.includes("changed in another tab")) {
            return {
                success: false,
                message: attemptedWrites.length
                    ? "Saved data changed in another tab. This attempt's unchanged values were rolled back; refresh and try again."
                    : "Saved data changed in another tab. No values were overwritten; refresh and try again."
            };
        }

        if (attemptedWrites.length === 0) {
            return {
                success: false,
                message: "Account creation could not start. No localStorage values were changed."
            };
        }

        return {
            success: false,
            message: "Account creation failed. The previous account and profile values were restored."
        };
    }

    return { success: true };
}

function createUserId() {
    return crypto.randomUUID();
}

function provisionLearnSpaceAdmin(email, displayName = "") {
    const emailValidation = validateEmailAddress(email);
    if (!emailValidation.success) {
        return emailValidation;
    }

    try {
        const userSnapshot = readRecordListSnapshot(USER_STORAGE_KEY);
        const users = userSnapshot.records;
        const usersValidationError = validateUserCollection(users);
        if (usersValidationError) {
            return { success: false, message: usersValidationError };
        }

        const matches = users.filter(
            (user) => normalizeEmail(user.email) === emailValidation.email
        );

        if (matches.length > 1) {
            return {
                success: false,
                message: "More than one account already uses this email. Resolve the duplicate records first."
            };
        }

        if (matches.length === 1) {
            if (matches[0].role !== "admin") {
                return {
                    success: false,
                    message: "This email already belongs to a different role. No account was changed."
                };
            }

            return {
                success: true,
                message: "An Admin account with this email already exists; no data was changed."
            };
        }

        const admin = {
            id: createUserId(),
            role: "admin",
            email: emailValidation.email,
            name: String(displayName || "").trim(),
            accountStatus: "active",
            createdAt: new Date().toISOString()
        };

        const updatedUsers = [...users, admin];
        const updatedUsersValidationError = validateUserCollection(updatedUsers);
        if (updatedUsersValidationError) {
            return { success: false, message: updatedUsersValidationError };
        }

        if (localStorage.getItem(USER_STORAGE_KEY) !== userSnapshot.rawValue) {
            return {
                success: false,
                message: "Saved account data changed in another tab. Refresh and try again; no values were overwritten."
            };
        }

        localStorage.setItem(
            USER_STORAGE_KEY,
            JSON.stringify(updatedUsers)
        );

        return {
            success: true,
            message: "The demo Admin account was added. No existing account was changed.",
            userId: admin.id
        };
    } catch (error) {
        console.error("Could not provision the demo Admin account:", error);
        return {
            success: false,
            message: "Could not create the Admin account. Existing storage was left unchanged."
        };
    }
}

// Explicit, manual setup only. This function does not run automatically.
window.provisionLearnSpaceAdmin = provisionLearnSpaceAdmin;

function resolveDemoLogin(email, role) {
    const emailValidation = validateEmailAddress(email);
    if (!emailValidation.success) {
        return emailValidation;
    }

    const userSnapshot = readRecordListSnapshot(USER_STORAGE_KEY);
    const users = userSnapshot.records;
    const usersValidationError = validateUserCollection(users);
    if (usersValidationError) {
        return { success: false, message: usersValidationError };
    }

    const matches = users.filter(
        (user) => normalizeEmail(user.email) === emailValidation.email
    );

    if (matches.length > 1) {
        return {
            success: false,
            message: "More than one account already uses this email. Please resolve the duplicate records first."
        };
    }

    if (matches.length === 1) {
        const user = matches[0];

        if (user.role !== role) {
            return {
                success: false,
                message: "This email already belongs to a different role. Choose that role to continue."
            };
        }

        if (user.accountStatus !== "active") {
            return {
                success: false,
                message: "This account is not active. No account or profile data was changed."
            };
        }

        if (role === "student" || role === "teacher") {
            const profileKey = role === "student"
                ? STUDENT_STORAGE_KEY
                : TEACHER_STORAGE_KEY;
            const otherProfileKey = role === "student"
                ? TEACHER_STORAGE_KEY
                : STUDENT_STORAGE_KEY;
            const profileSnapshot = readRecordListSnapshot(profileKey);
            const profileResult = findLinkedProfile(
                role,
                user.id,
                profileSnapshot.records,
                users
            );

            if (!profileResult.success) {
                return profileResult;
            }

            const otherProfileSnapshot = readRecordListSnapshot(otherProfileKey);
            const otherRole = role === "student" ? "teacher" : "student";
            const otherProfileValidationError = validateProfileCollection(
                otherProfileSnapshot.records,
                otherRole,
                users
            );

            if (otherProfileValidationError) {
                return { success: false, message: otherProfileValidationError };
            }

            const linkedToOtherRole = otherProfileSnapshot.records.some(
                (profile) => profile &&
                    typeof profile === "object" &&
                    profile.userId === user.id
            );

            if (linkedToOtherRole) {
                return {
                    success: false,
                    message: `This account is also linked to a ${role === "student" ? "teacher" : "student"} profile. Correct the profile link before logging in.`
                };
            }
        }

        return { success: true, user };
    }

    if (role === "admin") {
        return {
            success: false,
            message: "No Admin account exists for this email. An Admin account must be provisioned explicitly before login."
        };
    }

    if (role !== "student" && role !== "teacher") {
        return { success: false, message: "This role cannot create a demo account." };
    }

    const profileKey = role === "student"
        ? STUDENT_STORAGE_KEY
        : TEACHER_STORAGE_KEY;
    const otherProfileKey = role === "student"
        ? TEACHER_STORAGE_KEY
        : STUDENT_STORAGE_KEY;
    const profileIdKey = role === "student" ? "studentId" : "teacherId";
    const profileSnapshot = readRecordListSnapshot(profileKey);
    const profileValidationError = validateProfileCollection(
        profileSnapshot.records,
        role,
        users
    );

    if (profileValidationError) {
        return { success: false, message: profileValidationError };
    }

    const otherProfileSnapshot = readRecordListSnapshot(otherProfileKey);
    const otherProfileValidationError = validateProfileCollection(
        otherProfileSnapshot.records,
        role === "student" ? "teacher" : "student",
        users
    );

    if (otherProfileValidationError) {
        return { success: false, message: otherProfileValidationError };
    }

    const user = {
        id: createUserId(),
        role,
        email: emailValidation.email,
        name: "",
        accountStatus: "active",
        createdAt: new Date().toISOString()
    };
    const profile = {
        [profileIdKey]: createUserId(),
        userId: user.id,
        createdAt: new Date().toISOString()
    };

    if (role === "student") {
        profile.admissionStatus = "pending";
        profile.authorizationStatus = "pending";
        profile.semesterId = null;
    }

    const saveResult = persistNewDemoAccount(
        userSnapshot,
        profileSnapshot,
        profileKey,
        user,
        profile
    );

    if (!saveResult.success) {
        return saveResult;
    }

    return { success: true, user };
}

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
            "Demo mode only. Credentials are not verified; this opens the student courses page.";
        loginEyebrow.textContent = "YOUR LEARNING SPACE";
        loginSymbol.textContent = "✳";
    } else if (role === "teacher") {
        loginTitle.textContent = "Welcome, teacher.";
        loginSubtitle.textContent =
            "Demo mode only. Credentials are not verified; this opens the teacher dashboard.";
        loginEyebrow.textContent = "YOUR TEACHING SPACE";
        loginSymbol.textContent = "✦";
    } else {
        loginTitle.textContent = "Welcome, administrator.";
        loginSubtitle.textContent =
            "Demo mode only. Credentials are not verified; an explicitly provisioned Admin account is required.";
        loginEyebrow.textContent = "YOUR ADMIN SPACE";
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

    formMessage.textContent = "";

    let result;
    try {
        result = resolveDemoLogin(emailInput.value, selectedRole);
    } catch (error) {
        console.error("Could not read LearnSpace account data:", error);
        formMessage.textContent =
            "Saved account or profile data could not be read. No existing data was changed.";
        return;
    }

    if (!result.success) {
        formMessage.textContent = result.message;
        return;
    }

    const session = {
        userId: result.user.id,
        role: result.user.role,
        createdAt: new Date().toISOString(),
        mode: "demo"
    };

    try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
        console.error("Could not save the demo session:", error);
        formMessage.textContent =
            "Could not save the demo session. Please check browser storage.";
        return;
    }

    const destinations = {
        student: "student_courses.html",
        teacher: "teacher-dashboard.html",
        admin: "admin-dashboard.html"
    };

    window.location.href = destinations[selectedRole];
});
