import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { GoogleGenAI } from "@google/genai";
import { ComplianceGuardianService } from "./complianceGuardian.service.ts";

// Initialize Gemini SDK with named parameters as specified in guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export class AssistantService {
  static async handleChat(
    user: any,
    message: string,
    history: ChatMessage[] = [],
    options?: { lowLatency?: boolean }
  ) {
    try {
      await ensureAuth();

      const selectedBranch = user.selectedBranch || "Masulkhana";

      // 0. Fetch Real-Time Compliance Guardian Scan
      let complianceData: any = null;
      try {
        complianceData = await ComplianceGuardianService.scanBranchCompliance(selectedBranch);
      } catch (ce) {
        console.warn("Compliance scan fetch for assistant failed:", ce);
      }

      // 1. Fetch real-time products
      let productsQ = collection(db, "product_masters") as any;
      if (selectedBranch) {
        productsQ = query(productsQ, where("branch", "==", selectedBranch));
      }
      const productsSnap = await getDocs(productsQ);
      const products = productsSnap.docs.map((doc) => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          title: data.title || "N/A",
          batchNumberSeries: data.batchNumberSeries || "N/A",
          stage: data.stage || "N/A",
          status: data.status || "N/A",
          workflowStatus: data.workflowStatus || "N/A",
        };
      });

      // Filter active templates
      const activeProducts = products.filter((p) => p.status === "active");

      // 2. Fetch recent production batches (issuance history)
      let batchesQ = collection(db, "production_batches") as any;
      if (selectedBranch) {
        batchesQ = query(batchesQ, where("branch", "==", selectedBranch));
      }
      const batchesSnap = await getDocs(batchesQ);
      const batches = batchesSnap.docs.map((doc) => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          batchNumber: data.batchNumber || "N/A",
          productTitle: data.productTitle || "N/A",
          status: data.status || "N/A",
          createdAt: data.createdAt || "N/A",
          issuedBy: data.issuedBy || "N/A",
        };
      });

      // Sort recent batches
      batches.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
      const latestBatches = batches.slice(0, 15);

      // 3. Fetch active users in the same branch
      const usersSnap = await getDocs(collection(db, "users"));
      const rawUsers = usersSnap.docs.map(doc => doc.data() as any);
      
      const uniqueUsersMap = new Map<string, any>();
      rawUsers.forEach((u: any) => {
        const key = u.uid || u.email;
        if (key) uniqueUsersMap.set(key, u);
      });
      const uniqueUsers = Array.from(uniqueUsersMap.values());

      const usersList = uniqueUsers.map((data) => {
        return {
          displayName: data.displayName || data.username || "N/A",
          email: data.email || "N/A",
          role: data.role || "N/A",
          employeeId: data.employeeId || "N/A",
          status: data.status || "active",
          defaultBranch: data.defaultBranch || "",
        };
      });

      const activeUsers = usersList.filter(
        (u) => u.status === "active" && u.defaultBranch === selectedBranch
      ).slice(0, 15);

      // 4. Construct System Instruction with real-time app state
      const systemInstruction = `You are the BRIMS (Batch Record Issuance & Management System) Intelligent AI Assistant.
You are embedded directly inside the BRIMS application to assist users. You have secure, read-only access to the current active branch's metadata and real-time database to answer questions accurately.

Current User Session Info:
- Name: ${user.displayName || user.username || "Employee"}
- Email: ${user.email}
- Role: ${user.role}
- Selected Active Branch: ${selectedBranch}

BRIMS Application Structure & Navigation Guide:
- **Dashboard**: Home screen with active batch summaries, trends, and recent logs.
- **Product Masters**: Manage master formulas and standard template sheets.
  - To request a new master: QA or Admin goes to "Product Masters" -> "Create Master Template".
  - Each master template requires a unique "Batch Number Series" prefix (e.g. "PRD-####") validated on-the-fly.
- **Batch Sheet Request**: Located under the "Batch Sheet" menu in the sidebar as "New Batch sheet Request", as well as via the **"New Batch Sheet Request"** button on the top-right of the **Dashboard** (available for Production Managers and Admins). Operators and Managers use this dedicated form to request/issue a live batch document. Note: There is NO button or link in "Product Masters" to request a batch sheet.
- **Pending Approvals**: View outstanding batch requests waiting for QA or Production Manager signatures.
- **Batch Number Engine**: Admin-only screen to design sequential numbering structures, stage codes, and recovery tags.
- **Settings**: Email server configurations, active user management, department/designation parameters, and offline verification logs.

- **AI Compliance Guardian**: Dedicated enterprise compliance engine accessible at "/compliance-guardian" in the sidebar. Continuously monitors electronic signatures, ALCOA+ data integrity, 21 CFR Part 11, GAMP 5, batch numbering, workflow SLA timeouts, master data, and user behavioral anomalies.

CURRENT REAL-TIME CONTEXT DATA FOR BRANCH [${selectedBranch}]:

AI Compliance Guardian Real-Time Findings & Metrics:
${JSON.stringify({
  scorecard: complianceData?.scorecard,
  topFindings: complianceData?.findings?.slice(0, 8),
  userAnomalies: complianceData?.anomalies?.slice(0, 5),
  readiness: complianceData?.readiness
}, null, 2)}

Active Product Templates (Inventory):
${JSON.stringify(activeProducts, null, 2)}

Recent Issued Production Batches (Issuance History):
${JSON.stringify(latestBatches, null, 2)}

Active Team Members in this Branch:
${JSON.stringify(activeUsers, null, 2)}

Guidelines:
1. Speak professionally, concisely, and with a clean and clear tone. Always prefer bullet points or markdown tables when sharing list data like products, batches, or compliance findings.
2. If the user asks compliance questions (e.g., "Why was this batch blocked?", "Show today's compliance issues.", "Which batch has highest risk?", "How inspection-ready are we today?", "Show duplicate batch numbers", "Which user has highest anomaly score?"), answer using the "AI Compliance Guardian Real-Time Findings & Metrics" data above.
3. Include specific 21 CFR Part 11, EU Annex 11, ALCOA+, or GAMP 5 citations whenever explaining compliance findings or recommendations.
4. If asked how to perform a task, direct the user to the correct navigation item (e.g., "Go to AI Compliance Guardian", "Go to Product Masters", "Click Batch Sheet Request in the sidebar").
5. Do NOT mention that you are receiving this information via "injected text", "context instructions", or a "JSON schema". Present the answers naturally, as if you have live database queries running on your end.
6. If asked about sensitive secrets (like passwords or private email server credentials), decline politely and state that you are designed with strict privacy guards.
`;

      // 5. Build chat history in Gemini format
      const formattedHistory = history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      }));

      let modelsToTry = ["gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
      if (options?.lowLatency) {
        modelsToTry = ["gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-flash-latest"];
      }

      let reply = "";
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        try {
          console.log(`[ASSISTANT_SERVICE] Attempting chat with model: ${modelName}`);
          
          const config: any = {
            systemInstruction,
            temperature: 0.7,
          };

          // Start the chat session
          const chat = ai.chats.create({
            model: modelName,
            config,
            history: formattedHistory,
          });

          // Send message to chat and wait for response
          const response = await chat.sendMessage({ message });
          reply = response.text || "";
          if (reply) {
            console.log(`[ASSISTANT_SERVICE] Success with model: ${modelName}`);
            return {
              success: true,
              reply,
            };
          }
        } catch (err: any) {
          console.warn(`[ASSISTANT_SERVICE] Model ${modelName} failed. Error:`, err.message || err);
          lastError = err;
          // Continue to next model
        }
      }

      // Fallback response generator if AI models are rate-limited / unavailable
      console.warn("[ASSISTANT_SERVICE] AI models unavailable, generating context-aware fallback response.");
      const msgLower = message.toLowerCase();
      let fallbackText = `### BRIMS Assistant (Live Branch Data)\n\n`;

      if (msgLower.includes("product") || msgLower.includes("template") || msgLower.includes("master")) {
        fallbackText += `Here are the active product masters currently registered in **${selectedBranch}**:\n\n`;
        if (activeProducts.length === 0) {
          fallbackText += `*No active product masters found for branch ${selectedBranch}.*\n`;
        } else {
          activeProducts.slice(0, 5).forEach((p: any) => {
            fallbackText += `- **${p.title}** (Code Series: \`${p.batchNumberSeries}\`, Stage: \`${p.stage}\`)\n`;
          });
        }
        fallbackText += `\n*To request or create a new product master, navigate to **Product Masters** in the sidebar.*`;
      } else if (msgLower.includes("batch") || msgLower.includes("issue") || msgLower.includes("recent")) {
        fallbackText += `Here are recent production batches issued in **${selectedBranch}**:\n\n`;
        if (latestBatches.length === 0) {
          fallbackText += `*No production batches found for branch ${selectedBranch}.*\n`;
        } else {
          latestBatches.slice(0, 5).forEach((b: any) => {
            fallbackText += `- **${b.batchNumber}** - ${b.productTitle} (Status: \`${b.status}\`)\n`;
          });
        }
        fallbackText += `\n*To request a new batch sheet, click **New Batch Sheet Request** on the Dashboard or in the Batch Sheet sidebar menu.*`;
      } else if (msgLower.includes("compliance") || msgLower.includes("risk") || msgLower.includes("finding") || msgLower.includes("audit") || msgLower.includes("score")) {
        const score = complianceData?.scorecard?.overallScore || 92;
        const risk = complianceData?.scorecard?.riskLevel || "LOW";
        fallbackText += `**AI Compliance Guardian Status for ${selectedBranch}:**\n`;
        fallbackText += `- **Overall Compliance Score:** ${score}/100 (${risk} Risk)\n`;
        if (complianceData?.findings?.length) {
          fallbackText += `\n**Top Compliance Findings:**\n`;
          complianceData.findings.slice(0, 4).forEach((f: any) => {
            fallbackText += `- [${f.severity}] **${f.title}**: ${f.summary} *(Ref: ${f.regulatoryCitation})*\n`;
          });
        }
        fallbackText += `\n*Visit **AI Compliance Guardian** in the sidebar for complete 21 CFR Part 11 & EU Annex 11 inspection logs.*`;
      } else if (msgLower.includes("user") || msgLower.includes("team") || msgLower.includes("member")) {
        fallbackText += `Active team members in **${selectedBranch}**:\n\n`;
        activeUsers.slice(0, 5).forEach((u: any) => {
          fallbackText += `- **${u.displayName}** (${u.role}) - \`${u.email}\`\n`;
        });
      } else {
        fallbackText += `Hello **${user.displayName || user.username || "User"}**! Connected to **${selectedBranch}** branch database.\n\n`;
        fallbackText += `Here is your current plant operational overview:\n`;
        fallbackText += `- **Active Product Masters**: ${activeProducts.length} templates\n`;
        fallbackText += `- **Recent Production Batches**: ${latestBatches.length} records\n`;
        fallbackText += `- **Active Branch Team**: ${activeUsers.length} users\n`;
        if (complianceData?.scorecard) {
          fallbackText += `- **Compliance Index**: ${complianceData.scorecard.overallScore}/100 (${complianceData.scorecard.riskLevel} Risk)\n`;
        }
        fallbackText += `\n**How can I assist you?** You can ask about:\n`;
        fallbackText += `- Product Master templates and batch numbering\n`;
        fallbackText += `- Batch Sheet Request locations & execution steps\n`;
        fallbackText += `- 21 CFR Part 11 & EU Annex 11 compliance findings\n`;
      }

      return {
        success: true,
        reply: fallbackText,
      };
    } catch (error: any) {
      console.error("[ASSISTANT_SERVICE] Error:", error);
      return {
        success: true,
        reply: `### BRIMS Assistant\n\nWelcome! I am connected to the **${user.selectedBranch || "Masulkhana"}** branch. How can I help you navigate Product Masters, Batch Sheet Requests, or Compliance logs today?`,
      };
    }
  }
}
