const {
    TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, createIsolatedDatabase,
    startBackend, startFrontend
} = require("./harness");

async function main() {
    const isolated = await createIsolatedDatabase();
    let frontend;
    let backend;
    await isolated.seedAdmin();
    frontend = await startFrontend();
    backend = await startBackend(isolated.name, frontend.origin);
    console.log(`Temporary browser-test frontend: ${frontend.origin}/index.html`);
    console.log(`Temporary browser-test API: ${backend.baseUrl}`);
    console.log(`Temporary Admin email: ${TEST_ADMIN_EMAIL}`);
    console.log(`Temporary Admin password: ${TEST_ADMIN_PASSWORD}`);
    console.log("Press Ctrl+C in this process after the browser workflow; the isolated test database will be removed.");

    let closing = false;
    const cleanup = async () => {
        if (closing) return;
        closing = true;
        await backend.stop();
        await frontend.stop();
        await isolated.destroy();
        console.log("Temporary browser-test services and schema cleaned up.");
        process.exit(0);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    await new Promise(() => {});
}

main().catch((error) => {
    console.error(`Could not start browser-test environment: ${error.code || error.message}`);
    process.exitCode = 1;
});
