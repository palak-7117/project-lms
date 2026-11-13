const local = require("./local");

const selectedProvider = process.env.FILE_STORAGE_PROVIDER || "local";
const providers = new Map([[local.provider, local]]);
const storage = providers.get(selectedProvider);
if (!storage) throw new Error(`Unsupported FILE_STORAGE_PROVIDER: ${selectedProvider}`);

module.exports = {
    provider: storage.provider,
    put: (...args) => storage.put(...args),
    open: (...args) => storage.open(...args),
    remove: (...args) => storage.remove(...args)
};
