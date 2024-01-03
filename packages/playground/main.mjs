import "dotenv/config";
import { PromptTester } from "@internal/tester";

async function test() {
  const chainBuilder = await PromptTester.fromSchema("./schema.json");
  const result = await chainBuilder.test();

  return result;
}

test().then(console.log);
