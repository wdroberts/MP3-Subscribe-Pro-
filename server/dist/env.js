"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const envPath = path_1.default.resolve(__dirname, '../../.env');
const result = dotenv_1.default.config({ path: envPath });
if (result.error) {
    console.warn(`⚠ Could not load .env from ${envPath}`);
    console.warn('  Copy .env.example to .env and configure your credentials.');
}
else {
    console.log(`[env] Loaded .env from ${envPath}`);
}
//# sourceMappingURL=env.js.map