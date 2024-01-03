import fs from "fs";
import path from "path";

class ResultStorage {
  constructor(options) {
    this.outputDir = path.resolve(options.root, "output");
    if (!fs.existsSync) {
      fs.mkdirSync(this.outputDir);
    }
  }

  exists(name) {
    return fs.existsSync(this.filename(name));
  }

  write(name, value) {
    const v =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);

    return fs.promises.writeFile(this.filename(name), v);
  }

  async read(name, fallback) {
    if (this.exists(name)) {
      return fs.promises.readFile(this.filename(name), "utf8");
    }

    const result = await fallback();
    await this.write(name, result);
    return result;
  }

  filename(name) {
    return path.resolve(this.outputDir, `${name}.log`);
  }
}

export { ResultStorage };
