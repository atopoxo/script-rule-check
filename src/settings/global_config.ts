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
                return obj;
            } else {
                return {};
            }
        } catch (error) {
            console.error('加载全局配置失败:', error);
            return [];
        }
    }
}