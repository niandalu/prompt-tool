/**
 * inflate schema defintion. raw schema definition follows { "name:strategy": "value" }
 *
 * {"content:file": "foo.json"} is equivalent to {}
 */
import fs from "fs";
import path from "path";

const MAGIC_PATH = "data";

async function traverse(tree, parseKV) {
  if (typeof tree !== "object") {
    return tree;
  }

  if (Array.isArray(tree)) {
    return Promise.all(tree.map((one) => traverse(one, parseKV)));
  }

  const result = {};
  for (const [k, v] of Object.entries(tree)) {
    const [nextK, nextV] = await parseKV(k, v);
    result[nextK] = await traverse(nextV, parseKV);
  }
  return result;
}

class InflationStrategy {
  strategies = {
    file: (value) => {
      return fs.promises.readFile(path.resolve(this.workingDir, value), "utf8");
    },
    json: async (value) => {
      const text = await fs.promises.readFile(
        path.resolve(this.workingDir, value),
        "utf8",
      );
      return JSON.parse(data);
    },
  };

  constructor(options) {
    this.workingDir = options.workingDir;
  }

  async inflate(k, v) {
    const [kName, strategy] = k.split(":");

    if (!strategy) {
      return [kName, v];
    }

    const s = this.strategies[strategy];
    const finalValue = await s(v);

    return [kName, finalValue];
  }
}

export class SchemaReader {
  static fromFile(schemaPath) {
    return new SchemaReader(schemaPath);
  }

  constructor(schemaPath) {
    const data = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

    this.schemaPath = path.resolve(schemaPath);
    this.inflationStrategy = new InflationStrategy({
      workingDir: path.join(path.dirname(schemaPath), MAGIC_PATH),
    });
    this.rawData = data;
  }

  async read() {
    const result = await traverse(this.rawData, (k, v) =>
      this.inflationStrategy.inflate(k, v),
    );

    result.formatOutput = {
      name: "formatOutput",
      description: "将输出结果结构化返回",
      ...result.formatOutput,
    };

    return {
      ...result,
      formatOutput: {
        name: "formatOutput",
        description: "将输出结果结构化返回",
        ...result.formatOutput,
      },
    };
  }
}
