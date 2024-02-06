import fs from "fs";
import { LLMChain, SequentialChain } from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { OpenAI } from "langchain/llms/openai";
import {
  JsonOutputFunctionsParser,
  OutputFunctionsParser,
} from "langchain/output_parsers";
import { ChatPromptTemplate } from "langchain/prompts";
import { HandlebarsPromptTemplate } from "langchain/experimental/prompts/handlebars";
import path from "path";
import { SchemaReader } from "./reader.mjs";
import { ResultStorage } from "./storage.mjs";

const MODEL_CREATOR = {
  azure: (def) => {
    return new ChatOpenAI({
      azureOpenAIApiDeploymentName: def.name,
      azureOpenAIBasePath: process.env.AZURE_API_BASE_PATH,
    });
  },
  chatgpt: (def) => new ChatOpenAI({ modelName: def.name }),
  ollama: (def) => {
    return new ChatOllama({
      baseUrl: def.baseUrl || "http:localhost:11434",
      model: def.name,
    });
  },
};

function formatExamples(examples) {
  if (!examples) {
    return [];
  }

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
  const { schema, model: modelOptions, parser: givenParser } = options;
  const createBaseModel = MODEL_CREATOR[modelOptions.type.toLowerCase()];

  if (!schema.formatOutput) {
    const model = createBaseModel(modelOptions);
    return model;
  }

  const parser = givenParser || new JsonOutputFunctionsParser();
  const model = createBaseModel(modelOptions)
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
  return HandlebarsPromptTemplate.fromTemplate(txt);
}

const CHAIN_BUILDERS = {
  default: (promptSchema, options) => {
    const model = setupBaseModel(options);
    const prompt = HandlebarsPromptTemplate.fromTemplate(promptSchema.content);
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
        ? setupBaseModel({ ...options, parser })
        : setupBaseModel({ ...options, formatOutput: undefined });
      const prompt = HandlebarsPromptTemplate.fromTemplate(s.content);
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
  static async fromSchema(schemaPath, options) {
    const reader = SchemaReader.fromFile(schemaPath);
    const schema = await reader.read();
    const tester = new PromptTester(schema, {
      ...options,
      root: path.resolve(path.dirname(schemaPath)),
    });
    return tester;
  }

  constructor(schema, options) {
    this.schema = schema;
    this.root = options.root;
    this.dataDir = path.resolve(options.root, "data");
    this.storage = new ResultStorage({ root: options.root });
    this.model = options.model || {
      type: "chatgpt",
      name: "gpt-3.5-turbo-1106",
    };
  }

  async test(options = {}) {
    const skipCache = Boolean(process.env.NO_PROMPT_CACHE || options.skipCache);
    const runners = await this.buildRunners();

    const all = await Promise.all(
      runners.map(async (runner) => {
        const result = await this.storage.read(
          runner.name,
          () => {
            return runner.chain.batch(this.schema.cases);
          },
          { skipCache },
        );

        return { name: runner.name, result };
      }),
    );
    return all.reduce((memo, r) => {
      memo[r.name] = r.result;
      return memo;
    }, {});
  }

  async pick(name) {
    const runners = await this.buildRunners();

    return runners.find((r) => r.name === name);
  }

  buildRunners() {
    return Promise.all(
      this.schema.prompts.map(async (ptSchema) => {
        const options = {
          model: this.model,
          dataDir: this.dataDir,
          schema: this.schema,
        };
        const build = CHAIN_BUILDERS[ptSchema.type] || CHAIN_BUILDERS.default;
        const chain = await build(ptSchema, options);
        return { name: ptSchema.name, chain };
      }),
    );
  }
}

export { PromptTester };
