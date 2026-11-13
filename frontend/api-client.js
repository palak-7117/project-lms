(() => {
    const host = window.location.hostname || "127.0.0.1";
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const baseUrl = window.LEARNSPACE_API_BASE || `${protocol}//${host}:5000/api`;
    let csrfToken = null;
    let currentUser = null;

    class ApiError extends Error {
        constructor(message, status, code) {
            super(message);
            this.name = "ApiError";
            this.status = status;
            this.code = code;
        }
    }

    async function parseResponse(response) {
        let payload;
        try { payload = await response.json(); } catch { payload = null; }
        if (!response.ok || !payload?.success) {
            throw new ApiError(payload?.error || "The request could not be completed.", response.status, payload?.code);
        }
        if (payload.data?.csrfToken) csrfToken = payload.data.csrfToken;
        return payload;
    }

    async function getCsrf() {
        const response = await fetch(`${baseUrl}/auth/csrf`, { credentials: "include", headers: { Accept: "application/json" } });
        const payload = await parseResponse(response);
        csrfToken = payload.data.csrfToken;
        return csrfToken;
    }

    async function request(path, options = {}) {
        const method = (options.method || "GET").toUpperCase();
        const headers = new Headers(options.headers || {});
        headers.set("Accept", "application/json");
        const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
        if (unsafe) {
            if (!csrfToken) await getCsrf();
            headers.set("X-CSRF-Token", csrfToken);
        }
        if (options.body !== undefined && !(options.body instanceof FormData)) {
            headers.set("Content-Type", "application/json");
        }
        const response = await fetch(`${baseUrl}${path}`, {
            ...options,
            method,
            headers,
            credentials: "include",
            body: options.body === undefined || options.body instanceof FormData
                ? options.body
                : JSON.stringify(options.body)
        });
        const payload = await parseResponse(response);
        return payload.data;
    }

    window.LearnSpaceApi = Object.freeze({
        baseUrl,
        get: (path) => request(path),
        post: (path, body) => request(path, { method: "POST", body }),
        postMultipart: (path, body) => request(path, { method: "POST", body }),
        patch: (path, body) => request(path, { method: "PATCH", body }),
        put: (path, body) => request(path, { method: "PUT", body }),
        delete: (path) => request(path, { method: "DELETE" }),
        getCsrf,
        setCurrentUser(user) { currentUser = user; },
        getCurrentUser() { return currentUser; },
        ApiError
    });
})();
