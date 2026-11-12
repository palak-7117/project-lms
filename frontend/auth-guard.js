(() => {
    const scriptTag = document.currentScript;
    const requiredRole = scriptTag?.dataset.requiredRole;
    const appScripts = (scriptTag?.dataset.appScripts || "").split(",").map((name) => name.trim()).filter(Boolean);
    document.body.style.visibility = "hidden";

    const destinations = {
        admin: "admin-dashboard.html",
        teacher: "teacher-dashboard.html",
        student: "student_courses.html"
    };

    function redirectFor(user) {
        const destination = user && destinations[user.role] ? destinations[user.role] : "index.html?auth=required";
        window.location.replace(destination);
    }

    async function loadAppScript(filename) {
        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = filename;
            script.onload = resolve;
            script.onerror = () => reject(new Error("Dashboard module failed to load."));
            document.head.append(script);
        });
    }

    async function bootstrap() {
        try {
            const data = await window.LearnSpaceApi.get("/auth/me");
            const user = data.user;
            if (!user || user.role !== requiredRole) {
                redirectFor(user);
                return;
            }
            window.LearnSpaceApi.setCurrentUser(user);
            document.body.style.visibility = "visible";
            const header = document.querySelector(".admin-topbar-right, .header-right, .teacher-profile");
            if (header && !document.querySelector("#learnspaceLogout")) {
                const button = document.createElement("button");
                button.id = "learnspaceLogout";
                button.type = "button";
                button.className = "course-reset-button";
                button.textContent = "Sign out";
                button.addEventListener("click", async () => {
                    button.disabled = true;
                    try { await window.LearnSpaceApi.post("/auth/logout", {}); }
                    catch { /* The guard on the next page will reject a revoked or expired session. */ }
                    window.location.replace("index.html");
                });
                header.append(button);
            }
            for (const filename of appScripts) await loadAppScript(filename);
        } catch {
            window.location.replace("index.html?auth=required");
        }
    }

    void bootstrap();
})();
