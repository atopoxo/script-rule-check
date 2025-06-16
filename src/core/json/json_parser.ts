import * as fs from 'fs';
import * as json from 'comment-json';
import { DateTime } from 'luxon';
import * as jsonUtils from './json_utils';

interface JSONSchema {
    command: {
        name: string;
        args: Record<string, any>;
    };
    thoughts: {
        text: string;
        reasoning: string;
        plan: string;
        criticism: string;
        speak: string;
    };
}

export class JsonParser {
    private static instance: JsonParser;
    private JSON_SCHEMA: JSONSchema = {} as JSONSchema;

    private constructor() {
        this._initVariable();
    }

    public static getInstance(): JsonParser {
        if (!JsonParser.instance) {
            JsonParser.instance = new JsonParser();
        }
        return JsonParser.instance;
    }

    private _initVariable(): void {
        this.JSON_SCHEMA = {
            command: {
                name: "command name",
                args: {
                    "arg name": "value"
                }
            },
            thoughts: {
                text: "thought",
                reasoning: "reasoning",
                plan: "- short bulleted\n- list that conveys\n- long-term plan",
                criticism: "constructive self-criticism",
                speak: "thoughts summary to say to user"
            }
        };
    }

    public readJsonFile(filePath: string): any | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return json.parse(content);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return null;
            }
            console.error(`解析JSON文件时发生错误: ${filePath}`, error);
            return null;
        }
    }

    public parse(
        jsonStr: string,
        fixFunc?: (functionString: string, args: string[], description: string, data: any) => string,
        data?: any,
        tryToFix = true
    ): any {
        try {
            jsonStr = jsonStr.replace(/\t/g, "");
            return JSON.parse(jsonStr);
        } catch (error) {
            try {
                jsonStr = jsonUtils.correctJson(jsonStr);
                return JSON.parse(jsonStr);
            } catch (innerError) {
                // Continue to next fix attempt
            }
        }

        try {
            const braceIndex = jsonStr.indexOf("{");
            jsonStr = jsonStr.slice(braceIndex);
            const lastBraceIndex = jsonStr.lastIndexOf("}");
            jsonStr = jsonStr.slice(0, lastBraceIndex + 1);
            return JSON.parse(jsonStr);
        } catch (error: any) {
            if (tryToFix && fixFunc) {
                console.warn(
                    "Warning: Failed to parse AI output, attempting to fix." +
                    "\n If you see this warning frequently, it's likely that" +
                    " your prompt is confusing the AI. Try changing it up" +
                    " slightly."
                );

                const aiFixedJson = this.fixJson(jsonStr, fixFunc, data);
                if (aiFixedJson !== "failed") {
                    return JSON.parse(aiFixedJson);
                } else {
                    console.error("Failed to fix AI output, telling the AI.");
                    return jsonStr;
                }
            } else {
                throw error;
            }
        }
    }

    private fixJson(
        jsonStr: string,
        fixFunc: (functionString: string, args: string[], description: string, data: any) => string,
        data?: any
    ): string {
        const functionString = "function fixJson(jsonStr: string, schema?: string): string";
        const args = [JSON.stringify(jsonStr), JSON.stringify(this.JSON_SCHEMA)];
        const description = 
            "Fixes the provided JSON string to make it parseable" +
            " and fully compliant with the provided schema.\n If an object or" +
            " field specified in the schema isn't contained within the correct" +
            " JSON, it is omitted.\n This function is brilliant at guessing" +
            " when the format is incorrect.";

        if (!jsonStr.startsWith("`")) {
            jsonStr = "```json\n" + jsonStr + "\n```";
        }

        const resultString = fixFunc(functionString, args, description, data);
        console.debug("------------ JSON FIX ATTEMPT ---------------");
        console.debug(`Original JSON: ${jsonStr}`);
        console.debug("-----------");
        console.debug(`Fixed JSON: ${resultString}`);
        console.debug("----------- END OF FIX ATTEMPT ----------------");

        try {
            JSON.parse(resultString);
            return resultString;
        } catch {
            return "failed";
        }
    }

    public toJsonStr(data: any, indent = 0): string {
        const replacer = (key: string, value: any) => {
            if (value instanceof Date) {
                return DateTime.fromJSDate(value).toISO();
            }
            return value;
        };
        return JSON.stringify(data, replacer, indent);
    }
}

export function getJsonParser(): JsonParser {
    return JsonParser.getInstance();
}