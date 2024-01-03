import fs from "fs";
import { LLMChain, SequentialChain } from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { OpenAI } from "langchain/llms/openai";
import {
  JsonOutputFunctionsParser,
  OutputFunctionsParser,
} from "langchain/output_parsers";
import { ChatPromptTemplate, PromptTemplate } from "langchain/prompts";
import path from "path";
import { SchemaReader } from "./reader.mjs";
import { ResultStorage } from "./storage.mjs";

function formatExamples(examples) {
  return examples.map((eg) => {
    const result = {};
    for (const [k, v] of Object.entries(eg)) {
      if (Array.isArray(v)) {
        result[k] = v.join(",");
        continue;
      }

      result[k] = v.trim();
    }
    return result;
  });
}

const setupBaseModel = (options) => {
  const { modelName, schema } = options;
  const parser = new JsonOutputFunctionsParser();
  const model = new ChatOpenAI({ modelName })
    .bind({
      functions: [schema.formatOutput],
      function_call: { name: "formatOutput" },
    })
    .pipe(parser);
  return model;
};

async function readPromptFile(filepath, options) {
  const txt = await fs.promises.readFile(
    path.resolve(options.dataDir, filepath),
    "utf8",
  );
  return PromptTemplate.fromTemplate(txt);
}

const CHAIN_BUILDERS = {
  default: (promptSchema, options) => {
    const model = setupBaseModel(options);
    const prompt = PromptTemplate.fromTemplate(promptSchema.content);
    return prompt.pipe(model);
  },
  chat: async (promptSchema, options) => {
    const model = setupBaseModel(options);
    const { dataDir: staticDir, schema } = options;
    const dataDir = path.join(staticDir, promptSchema.root);
    const [systemPt, humanPt, aiPt] = await Promise.all([
      readPromptFile("system.txt", { dataDir }),
      readPromptFile("human.txt", { dataDir }),
      readPromptFile("ai.txt", { dataDir }),
    ]);
    const examples = formatExamples(schema.examples);
    const messages = [["system", systemPt.template]];
    for (const eg of examples) {
      const [human, ai] = await Promise.all([
        humanPt.format(eg),
        aiPt.format(eg),
      ]);
      messages.push(["human", human], ["ai", ai]);
    }
    messages.push(["human", humanPt.template]);

    const prompt = ChatPromptTemplate.fromMessages(messages);
    return prompt.pipe(model);
  },
  cot: async (promptSchema, options) => {
    const { modelName } = options;
    const parser = new OutputFunctionsParser();
    const steps = promptSchema.steps.map((s, i) => {
      const isLast = i === promptSchema.steps.length - 1;
      const llm = isLast
        ? new ChatOpenAI({ modelName })
            .bind({
              functions: [options.schema.formatOutput],
              function_call: { name: "formatOutput" },
            })
            .pipe(parser)
        : new OpenAI({ modelName });
      const prompt = PromptTemplate.fromTemplate(s.content);
      const outputKey = s.outputKey;

      return {
        llm,
        prompt,
        outputKey,
      };
    });
    const chains = steps.map((s) => new LLMChain(s));

    return new SequentialChain({
      chains,
      inputVariables: steps[0].prompt.inputVariables,
      outputVariables: [steps[steps.length - 1].outputKey],
    });
  },
};

class PromptTester {
  static async fromSchema(schemaPath) {
    const reader = SchemaReader.fromFile(schemaPath);
    const schema = await reader.read();
    return new PromptTester(schema, {
      root: path.resolve(path.dirname(schemaPath)),
    });
  }

  constructor(schema, options) {
    this.schema = schema;
    this.root = options.root;
    this.dataDir = path.resolve(options.root, "data");
    this.storage = new ResultStorage({ root: options.root });
  }

  async test() {
    const runners = await this.buildRunners();

    const all = await Promise.all(
      runners.map(async (runner) => {
        const result = await this.storage.read(runner.name, () =>
          runner.chain.batch(this.schema.cases),
        );

        return { name: runner.name, result };
      }),
    );
    return all.reduce((memo, r) => {
      memo[r.name] = r.result;
      return memo;
    }, {});
  }

  pick(name) {
    const runners = await this.buildRunners();

    return runners.find(r => r.name === name)
  }

  buildRunners() {
    return Promise.all(
      this.schema.prompts.map(async (ptSchema) => {
        const options = {
          modelName: "gpt-3.5-turbo-1106",
          dataDir: this.dataDir,
          schema: this.schema,
        };
        const build = CHAIN_BUILDERS[ptSchema.type || "default"];
        const chain = await build(ptSchema, options);
        return { name: ptSchema.name, chain };
      }),
    );
  }
}

export { PromptTester };
