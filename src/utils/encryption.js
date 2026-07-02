const crypto = require("crypto");

const algorithm = "aes-256-gcm";
const ivLength = 16;
const saltLength = 64;
const tagLength = 16;

// Get key from environment variable
const getEncryptionKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error("ENCRYPTION_KEY environment variable is missing");
    }
    // ensure key is 32 bytes (256 bits)
    if (key.length === 64) {
        return Buffer.from(key, "hex");
    }
    throw new Error("ENCRYPTION_KEY must be a 64 character hex string");
};

const encryptToken = (text) => {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(ivLength);
        const salt = crypto.randomBytes(saltLength);
        const key = getEncryptionKey();

        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, "utf8", "hex");
        encrypted += cipher.final("hex");
        
        const tag = cipher.getAuthTag();

        return Buffer.concat([salt, iv, tag, Buffer.from(encrypted, "hex")]).toString("base64");
    } catch (error) {
        console.error("Encryption error:", error);
        throw new Error("Failed to encrypt token");
    }
};

const decryptToken = (encryptedText) => {
    if (!encryptedText) return encryptedText;
    try {
        // Simple heuristic: base64 encoded strings typically don't have spaces, 
        // plain text tokens from HubSpot are usually formatted like pat-na1-xxxx
        if (!encryptedText.includes('==') && !encryptedText.includes('+') && !encryptedText.includes('/')) {
             if (encryptedText.startsWith('pat-') || encryptedText.length < 100) {
                 // Might be unencrypted legacy token
                 return encryptedText;
             }
        }

        const buffer = Buffer.from(encryptedText, "base64");
        const salt = buffer.subarray(0, saltLength); // salt is unused in this simple version, but kept for future key derivation compatibility if needed
        const iv = buffer.subarray(saltLength, saltLength + ivLength);
        const tag = buffer.subarray(saltLength + ivLength, saltLength + ivLength + tagLength);
        const encrypted = buffer.subarray(saltLength + ivLength + tagLength);
        
        const key = getEncryptionKey();

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(encrypted, undefined, "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    } catch (error) {
        // Fallback for unencrypted tokens that fail decryption
        return encryptedText;
    }
};

module.exports = {
    encryptToken,
    decryptToken,
};
