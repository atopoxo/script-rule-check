export function extractCharPosition(errorMessage: string): number {
    const charPattern = /\(char (\d+)\)/;
    const match = charPattern.exec(errorMessage);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    throw new Error("Character position not found in the error message.");
}

export function addQuotesToPropertyNames(jsonString: string): string {
    const propertyNamePattern = /(\w+):/g;
    const correctedJsonString = jsonString.replace(
        propertyNamePattern, 
        (match, p1) => `"${p1}":`
    );

    try {
        JSON.parse(correctedJsonString);
        return correctedJsonString;
    } catch (error) {
        throw error;
    }
}

export function balanceBraces(jsonString: string): string | null {
    let openBracesCount = (jsonString.match(/{/g) || []).length;
    let closeBracesCount = (jsonString.match(/}/g) || []).length;

    let balancedStr = jsonString;
    
    while (openBracesCount > closeBracesCount) {
        balancedStr += "}";
        closeBracesCount++;
    }
    
    while (closeBracesCount > openBracesCount) {
        balancedStr = balancedStr.replace(/\}[^}]*$/, "");
        closeBracesCount--;
    }

    try {
        JSON.parse(balancedStr);
        return balancedStr;
    } catch {
        return null;
    }
}

export function fixInvalidEscape(jsonStr: string, errorMessage: string): string {
    while (errorMessage.startsWith("Invalid \\escape")) {
        const badEscapeLocation = extractCharPosition(errorMessage);
        jsonStr = jsonStr.slice(0, badEscapeLocation) + jsonStr.slice(badEscapeLocation + 1);
        try {
            JSON.parse(jsonStr);
            return jsonStr;
        } catch (error: any) {
            errorMessage = error.message;
        }
    }
    return jsonStr;
}

export function correctJson(jsonStr: string): string {
    try {
        JSON.parse(jsonStr);
        return jsonStr;
    } catch (error: any) {
        const errorMessage = error.message;
        
        if (errorMessage.includes("Invalid escape")) {
            return fixInvalidEscape(jsonStr, errorMessage);
        }
        
        if (errorMessage.includes("property name")) {
            const quoted = addQuotesToPropertyNames(jsonStr);
            try {
                JSON.parse(quoted);
                return quoted;
            } catch (innerError) {
                // Continue to next fix attempt
            }
        }
        
        const balanced = balanceBraces(jsonStr);
        if (balanced) {
            return balanced;
        }
        
        return jsonStr;
    }
}