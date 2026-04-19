const { readTextFile, writeTextFile, exists } = window.__TAURI__.fs;
const { BaseDirectory } = window.__TAURI__.fs;

export async function readLocalFile(fileName) {
    try {
        const fileExists = await exists(fileName, { baseDir: BaseDirectory.AppData });
        if (fileExists) {
            const content = await readTextFile(fileName, { baseDir: BaseDirectory.AppData });
            return JSON.parse(content);
        }
    } catch (error) {
        console.error(`Lỗi đọc file ${fileName}:`, error);
    }
    return null;
}

export async function writeLocalFile(fileName, dataObject) {
    try {
        const content = JSON.stringify(dataObject, null, 2);
        await writeTextFile(fileName, content, { baseDir: BaseDirectory.AppData });
        return true;
    } catch (error) {
        console.error(`Lỗi ghi file ${fileName}:`, error);
        return false;
    }
}