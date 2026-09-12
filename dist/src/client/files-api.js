import { Api } from "telegram";
import { createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
const CHUNK_SIZE = 512 * 1024; // 512 KB per upload part
const BIG_FILE_THRESHOLD = 10 * 1024 * 1024; // >10 MB → big-file API
const MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".txt": "text/plain",
    ".md": "text/markdown",
};
export class FilesAPI {
    client;
    resolvePeer;
    ensureConnected;
    constructor(client, resolvePeer, ensureConnected) {
        this.client = client;
        this.resolvePeer = resolvePeer;
        this.ensureConnected = ensureConnected;
    }
    async sendFile(chatId, filePath, caption, forceDocument = false) {
        this.ensureConnected();
        const peer = await this.resolvePeer(chatId);
        const { file } = await this._uploadFile(filePath);
        const fileName = basename(filePath);
        const mimeType = MIME_BY_EXT[extname(fileName).toLowerCase()] ??
            "application/octet-stream";
        const isPhoto = !forceDocument && mimeType.startsWith("image/") && mimeType !== "image/gif";
        const media = isPhoto
            ? new Api.InputMediaUploadedPhoto({ file })
            : new Api.InputMediaUploadedDocument({
                file,
                mimeType,
                attributes: [new Api.DocumentAttributeFilename({ fileName })],
            });
        const result = await this.client().invoke(new Api.messages.SendMedia({
            peer,
            media,
            message: caption ?? "",
            randomId: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
        }));
        const msg = result?.updates?.find((u) => u.className === "UpdateNewMessage" ||
            u.className === "UpdateNewChannelMessage")?.message ??
            result?.updates?.[0]?.message ??
            result;
        return {
            messageId: Number(msg?.id ?? 0),
            chatId,
            date: Number(msg?.date ?? Math.floor(Date.now() / 1000)),
        };
    }
    /**
     * Chunked raw upload via Api.upload.SaveFilePart / SaveBigFilePart —
     * no gramjs uploadFile helper.
     */
    async _uploadFile(filePath) {
        const stat = statSync(filePath);
        if (!stat.isFile())
            throw new Error(`Not a file: ${filePath}`);
        const isBig = stat.size > BIG_FILE_THRESHOLD;
        // gramjs types int128/int256 fields as BigInteger; runtime takes native bigint
        const fileId = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
        const parts = Math.ceil(stat.size / CHUNK_SIZE);
        const name = basename(filePath);
        const md5 = createHash("md5");
        let filePart = 0;
        const stream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
        for await (const chunk of stream) {
            const bytes = chunk;
            md5.update(bytes);
            await this.client().invoke(isBig
                ? new Api.upload.SaveBigFilePart({
                    fileId,
                    filePart,
                    fileTotalParts: parts,
                    bytes,
                })
                : new Api.upload.SaveFilePart({ fileId, filePart, bytes }));
            filePart++;
        }
        const file = isBig
            ? new Api.InputFileBig({ id: fileId, parts, name })
            : new Api.InputFile({ id: fileId, parts, name, md5Checksum: md5.digest("hex") });
        return { file };
    }
}
//# sourceMappingURL=files-api.js.map