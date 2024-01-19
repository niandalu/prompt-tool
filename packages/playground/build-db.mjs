import { globby } from "globby";
import fs from "fs";

const dedupPush = (arr, one) => {
  if (!arr) {
    return [one];
  }

  if (arr.includes(one)) {
    return arr;
  }
  return arr.concat(one);
};

async function merge() {
  const predictionFiles = await globby("./washed/*.json");
  const predictions = await Promise.all(
    predictionFiles.map(async (p) => {
      const content = await fs.promises.readFile(p, "utf8");
      return JSON.parse(content);
    }),
  );

  return predictions.reduce((memo, p) => {
    const addition = Object.keys(p).reduce((kv, k) => {
      try {
        const xss = k.split("-");
        const author = xss.pop();
        kv[`${xss.join("-")}/${author}`] = JSON.parse(p[k]);
        return kv;
      } catch (e) {
        console.error(e);
        console.log(p[k]);
      }
      return kv;
    }, {});

    return { ...memo, ...addition };
  }, {});
}

async function buildDB() {
  const db = {
    poets: {},
    index: {},
  };
  const rawPoets = JSON.parse(fs.readFileSync("./poets.json", "utf8"));
  const predictions = await merge();

  for (const p of rawPoets) {
    const id = `${p.title || "无题"}/${p.author}`;
    db.poets[id] = p;

    const pd = predictions[id];
    const tags = Array.from(
      new Set((pd.scenarios || []).concat(pd.objects || [])),
    );
    if (!tags.length) {
      console.log(id, "no tag");
    }
    for (const t of tags) {
      db.index[t] = dedupPush(db.index[t], id);
    }
    db.index[p.author] = dedupPush(db.index[p.author], id);
    db.index[p.title] = dedupPush(db.index[p.title], id);
  }

  fs.writeFileSync("/tmp/db.json", JSON.stringify(db, null, 2));
}

buildDB();
