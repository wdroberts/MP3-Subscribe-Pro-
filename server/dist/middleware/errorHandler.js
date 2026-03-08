"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
/* eslint-disable @typescript-eslint/no-unused-vars */
function errorHandler(err, _req, res, _next) {
    /* eslint-enable @typescript-eslint/no-unused-vars */
    console.error('Error:', err.message);
    const statusCode = err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';
    const response = {
        error: isProduction && statusCode >= 500
            ? 'Internal server error'
            : err.message || 'Internal server error',
    };
    if (!isProduction) {
        response.details = err.stack;
    }
    res.status(statusCode).json(response);
}
//# sourceMappingURL=errorHandler.js.map