const fs = require('fs');
const readline = require('readline');
const https = require('https');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    console.log("=========================================");
    console.log("HubXpert Radar Workflow Action Setup");
    console.log("=========================================\n");

    const developerToken = await question("Enter your HubSpot Developer Token (or Personal Access Token with Developer scopes): ");
    const appId = await question("Enter your HubSpot App ID (e.g. 2d1d0015-124a-4379-b782-c44f803fed3d): ");
    const actionUrl = await question("Enter the base URL for the action (e.g. https://your-ngrok.ngrok.io/api/webhooks/workflow/score-renewal): ");

    rl.close();

    const payload = JSON.stringify({
        actionUrl: actionUrl,
        published: true,
        actionLabels: {
            en: {
                actionName: "Calculate Health Score",
                actionDescription: "Recalculates the HubXpert Radar health score for the company.",
                appDisplayName: "HubXpert Radar",
                actionCardContent: "Calculate health score for company"
            }
        },
        inputFields: [
            {
                typeDefinition: {
                    name: "companyId",
                    type: "string",
                    fieldType: "string"
                },
                supportedValueTypes: ["OBJECT_PROPERTY"],
                isRequired: true
            }
        ],
        outputFields: [
            {
                typeDefinition: {
                    name: "healthScore",
                    type: "number",
                    fieldType: "number"
                },
                supportedValueTypes: ["STATIC_VALUE"]
            },
            {
                typeDefinition: {
                    name: "riskLevel",
                    type: "string",
                    fieldType: "string"
                },
                supportedValueTypes: ["STATIC_VALUE"]
            },
            {
                typeDefinition: {
                    name: "riskExplanation",
                    type: "string",
                    fieldType: "string"
                },
                supportedValueTypes: ["STATIC_VALUE"]
            }
        ],
        objectTypes: ["COMPANY"]
    });

    const options = {
        hostname: 'api.hubapi.com',
        path: `/automation/v4/actions/${appId}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${developerToken}`,
            'Content-Length': payload.length
        }
    };

    console.log("\nCreating Custom Workflow Action in HubSpot...");

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log("\n✅ Successfully created workflow action!");
                console.log(data);
            } else {
                console.error(`\n❌ Failed with status code: ${res.statusCode}`);
                console.error(data);
            }
        });
    });

    req.on('error', (error) => {
        console.error("\n❌ Network Error:");
        console.error(error);
    });

    req.write(payload);
    req.end();
}

main();
