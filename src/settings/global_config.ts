import * as path from "path";
import fs from 'fs';
import { getJsonParser } from '../core/json/json_parser';

export class GlobalConfig {
    private jsonParser = getJsonParser();

    constructor() {
        
    }

    public getConfig(): any {
        try {
            const configPath = path.join(__dirname, '../', '../../assets/config/global_config.json');
            const rawConfig = fs.readFileSync(configPath, 'utf-8');
            if (rawConfig) {
                const obj = this.jsonParser.parse(rawConfig);
                const result = this.transformValidApiKey(obj);
                return result;
            } else {
                return {};
            }
        } catch (error) {
            console.error('加载全局配置失败:', error);
            return [];
        }
    }

    private transformValidApiKey(obj: any): any {
        if (Array.isArray(obj)) {
            return obj.map(item => this.transformValidApiKey(item));
        } else if (obj !== null && typeof obj === 'object') {
            const result: any = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    if (key === 'exampleKey') {
                        const originalValue = obj[key];
                        const replacedValue = originalValue?.replace?.(/\*/g, '-') || originalValue;
                        result['apiKey'] = replacedValue;
                    } else {
                        result[key] = this.transformValidApiKey(obj[key]);
                    }
                }
            }
            return result;
        } else {
            return obj;
        }
    }
}