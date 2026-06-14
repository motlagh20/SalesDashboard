import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function main() {
  console.log("🚀 Starting manual agent injection script...");

  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  let database = process.env.DB_NAME || "salesdashboard";
  if (database === "sales_dashboard") {
    database = "salesdashboard";
  }

  const sampleAgent = {
    id: `ag-manual-${Date.now()}`,
    fullName: "جناب آقای مهندس حمید طباطبایی",
    alias: "نمایندگی رسمی اصفهان (بخش مرکزی)",
    agentCode: "TBN-8899",
    phoneNumber: "09131234567",
    address: "کیلومتر ۳ جاده ذوب‌آهن، مجتمع ترابری سپاهان، پلاک ۵",
    area: "اصفهان و حومه مرکزی",
    isEnabled: 1
  };

  // 1. Try MariaDB
  let mariadbSuccess = false;
  try {
    console.log(`📡 Attempting to connect to MariaDB at ${host}:${port}...`);
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database
    });

    console.log("✅ Connected to MariaDB!");
    
    // Check if duplicate code exists
    const [rows]: any = await connection.query("SELECT * FROM agents WHERE agentCode = ?", [sampleAgent.agentCode]);
    if (rows && rows.length > 0) {
      console.log(`⚠️ Agent with code ${sampleAgent.agentCode} already exists in MariaDB.`);
    } else {
      await connection.query(
        "INSERT INTO agents (id, fullName, alias, agentCode, phoneNumber, address, area, isEnabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          sampleAgent.id,
          sampleAgent.fullName,
          sampleAgent.alias,
          sampleAgent.agentCode,
          sampleAgent.phoneNumber,
          sampleAgent.address,
          sampleAgent.area,
          sampleAgent.isEnabled
        ]
      );
      console.log("🎉 Successfully inserted sample agent into MariaDB database!");
    }
    await connection.end();
    mariadbSuccess = true;
  } catch (err: any) {
    console.error("❌ MariaDB Inserts threw exception:", err.message);
    console.log("💡 MariaDB is either not running here or credentials differ. Proceeding with JSON-fallback injection...");
  }

  // 2. Try JSON Fallback
  try {
    const jsonPath = path.join(process.cwd(), "server", "salesdashboard.json");
    console.log(`📂 Inspecting JSON fallback file at ${jsonPath}...`);
    
    if (fs.existsSync(jsonPath)) {
      const fileContent = fs.readFileSync(jsonPath, "utf-8");
      const data = JSON.parse(fileContent);
      
      if (!data.agents) {
        data.agents = [];
      }

      const exists = data.agents.some((a: any) => a.agentCode?.toUpperCase() === sampleAgent.agentCode.toUpperCase());
      if (exists) {
        console.log(`⚠️ Agent with code ${sampleAgent.agentCode} already exists in salesdashboard.json.`);
      } else {
        data.agents.push(sampleAgent);
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
        console.log("🎉 Successfully inserted sample agent into salesdashboard.json!");
      }
    } else {
      console.error("❌ JSON database file salesdashboard.json not found.");
    }
  } catch (err: any) {
    console.error("❌ JSON Fallback Inserts threw exception:", err.message);
  }

  console.log("✨ Seeder run completed!");
}

main();
