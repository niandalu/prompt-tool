# 提示词辅助工具

注意，`@internal/tester` 并没有发包，只在这个 monorepo 中使用。

## 为什么

过去在开发相关功能时，我都是自己写独立脚本来跑（相比用个三方平台脚本会有很多自由）。

发现了几个问题：

1. 在脚本里写 prompt，会把脚本弄的很复杂。比如一些字符转义问题
2. prompt 迭代时缺乏版本管理，prompt 间对比麻烦
3. Few-Shots 和 CoT 实现时会有重复工作，实现成本还是有点儿高
4. 保证返回结构化，总是要做额外工作

## 功能

通过定义一个特殊的 schema.json 来降低成本，使得日常开发中，不再需要编写相关代码。

1. 为 schema 引入特殊语法，让他可以去 source 文件
2. 内嵌 function calling
3. 内嵌 CoT、Few-Shots 的实现
4. 支持 OpenAI ChatGPT、Azure 和 Ollama

## 如何使用

1. `rush update`
2. `cd packages/playground`
3. 创建 .env，把你的 OPENAI_API_KEY 填了
4. 根据需求，改改 schema.json
5. `node main.mjs`

## 示例

直接看 `packages/playground` 就可以了。

### 调用方式

``` javascript
import "dotenv/config";
import { PromptTester } from "@internal/tester";
import path from "path";

async function test() {
  const chainBuilder = await PromptTester.fromSchema(
    // Schema.json 的位置
    path.resolve(__dirname, "./enum-converter/schema.json"),
    // {
    //   model: {
    //     type: "azure", // 这里可以定制模型类型，支持 OpenAI ChatGPT、Azure 和 Ollama
    //     name: "gpt-35-turbo-1106",
    //   },
    // },
  );
  const result = await chainBuilder.test({ skipCache: true });
  return result;
}

test().then(console.log);

```

## Schema 说明


``` javascript
{
  // prompts 的定义，type 支持 default（基础补全） | chat（有 few shots） | cot（CoT）
  "prompts": [
    { "name": "v1", "type": "default", "content:file": "./prompt/v1.txt" },
    { "name": "v2", "type": "chat", "root": "./prompt/v2" },
    {
      "name": "v3",
      "type": "cot",
      "steps": [
        {
          "content:file": "./prompt/v3/translation.txt",
          "outputKey": "explanation"
        },
        {
          "content:file": "./prompt/v3/extraction.txt",
          "outputKey": "extraction"
        }
      ]
    }
  ],
  // function calling 的定义
  "formatOutput": {
    "parameters": {
      "type": "object",
      "properties": {
        "explanation": {
          "type": "string",
          "description": "现代文翻译"
        },
        "scenarios": {
          "type": "array",
          "description": "场景列表",
          "items": {
            "type": "string",
            "description": "诗词可以应用的场景"
          }
        },
        "objects": {
          "type": "array",
          "description": "事物列表",
          "items": {
            "type": "string",
            "description": "诗词所描述的事物"
          }
        }
      }
    },
    "required": ["explanation", "scenario", "objects"]
  },

  // few shots，内容随意，就是 prompt template variables
  "examples": [
    {
      "title": "关雎",
      "author": "佚名",
      "source": "诗经",
      "content:file": "guanju.txt",

      "explanation:file": "guanju.explanation.txt",
      "scenarios": ["思念"],
      "objects": ["女子", "爱情", "河", "雎鸠"]
    },
    {
      "title": "山居秋暝",
      "author": "王维",
      "source": "唐诗",
      "content:file": "shanjuqiuming.txt",

      "explanation": "一场新雨过后，青山变得更加清朗空旷，秋天的傍晚，天气也格外的凉爽。皎洁的明月透过松林撒落下斑驳的银光，清清的泉水在大石头上叮咚流淌。竹林深处传来欢声笑语，那是洗衣归来的农家女；莲花摇动的地方，那是沿流而下的打渔的小船。任凭春天的芳菲随着时令消逝吧，秋色如此令人流连，我自可留居山中。",
      "scenarios": ["归隐", "雨后"],
      "objects": ["山水", "雨", "秋天", "傍晚", "泉", "松树", "竹"]
    },
    {
      "title": "赤壁",
      "author": "杜牧",
      "source": "唐诗",
      "content:file": "chibi.txt",

      "explanation:file": "chibi.explanation.txt",
      "scenarios": ["观景"],
      "objects": ["赤壁", "江"]
    }
  ],

  // 测试用例，xxx:file 的语法，会被转换成 xxx
  "cases": [
    {
      "title": "夜雨寄北",
      "author": "李商隐",
      "source": "唐诗",
      "content:file": "yeyujibei.txt"
    },
    {
      "title": "雨霖铃",
      "author": "柳永",
      "source": "宋词",
      "content:file": "yulinling.txt"
    }
  ]
}
```
