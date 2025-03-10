import type { HandlerCallback, IAgentRuntime, Memory, State } from "@elizaos/core";
import { composeContext, elizaLogger, generateObjectDeprecated, ModelClass } from "@elizaos/core";
import { CalculateParams } from "../types/index.js";

export const calculateTemplate = `Given the recent messages below:

{{recentMessages}}

Extract the following information about the requested calculation:
- Operation type (percentage, division, multiplication, sum, or subtraction)
- First value (must be a valid number)
- Second value (must be a valid number)

Respond with a JSON markdown block containing only the extracted values:

\`\`\`json
{
    "operation": "percentage" | "division" | "multiplication" | "sum" | "subtraction",
    "value1": string,
    "value2": string
}
\`\`\`
`;

export const calculateAction = {
    name: "calculate",
    description: "Performs basic mathematical operations",

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback?: HandlerCallback
    ) => {
        console.log("Calculate action handler called");

        // Initialize or update state
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Compose calculation context
        const calculateContext = composeContext({
            state,
            template: calculateTemplate
        });

        const content = await generateObjectDeprecated({
            runtime,
            context: calculateContext,
            modelClass: ModelClass.LARGE,
        });

        try {
            const { operation, value1, value2 } = content;
            const num1 = parseFloat(value1);
            const num2 = parseFloat(value2);

            if (isNaN(num1) || isNaN(num2)) {
                console.log(num1, num2);
                throw new Error("Invalid numeric values provided");
            }

            let result: number;
            switch (operation) {
                case "percentage":
                    result = (num1 * num2) / 100;
                    break;
                case "division":
                    if (num2 === 0) {
                        throw new Error("Division by zero is not allowed");
                    }
                    result = num1 / num2;
                    break;
                case "multiplication":
                    result = num1 * num2;
                    break;
                case "sum":
                    result = num1 + num2;
                    break;
                case "subtraction":
                    result = num1 - num2;
                    break;
                default:
                    throw new Error("Invalid operation");
            }

            if (callback) {
                callback({
                    text: `Result of ${operation}: ${result}`,
                    content: {
                        success: true,
                        operation,
                        result
                    },
                });
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error in calculate handler:", error);
            if (callback) {
                callback({ text: `Error: ${error.message}` });
            }
            return false;
        }
    },
    template: calculateTemplate,
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "What is 15% of 200?",
                    action: "CALCULATE",
                },
            },
            {
                user: "user",
                content: {
                    text: "Divide 100 by 4",
                    action: "CALCULATE",
                },
            },
            {
                user: "user",
                content: {
                    text: "Multiply 12 by 5",
                    action: "CALCULATE",
                },
            }
        ],
    ],
    similes: ["CALCULATE", "MATH", "COMPUTE"],
    validate: async () => true,
}; 