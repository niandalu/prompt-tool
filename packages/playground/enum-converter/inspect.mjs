import { globby } from "globby";
import fs from "fs";

async function inspect() {
  const files = await globby("./output/*.log");

  const result = Promise.all(
    files.map(async (f) => {
      const content = await fs.promises.readFile(f, "utf8");
      const data = JSON.parse(content);
      console.log(data[0].code);
    }),
  );
  result.then(console.log);
}

inspect();
