import "dotenv/config";
import { PromptTester } from "@internal/tester";
import path from "path";

async function test() {
  const chainBuilder = await PromptTester.fromSchema(
    path.resolve(__dirname, "./translator/schema.json"),
    // {
    //   model: {
    //     type: "azure",
    //     name: "gpt-35-turbo-1106",
    //   },
    // },
  );
  const result = await chainBuilder.test({ skipCache: true });
  return result;
}

test().then(console.log);
