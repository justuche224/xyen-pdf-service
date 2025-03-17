import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    maxAge: 86400,
  })
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "PDF Extraction Service" });
});

app.post("/api/v1/extract", async (c) => {
  try {
    const body = await c.req.json();
    const { url } = body;

    if (!url) {
      return c.json({ error: "URL is required" }, 400);
    }

    console.log(`Processing PDF from: ${url}`);
    const text = await extractTextFromPDF(url);

    if (!text) {
      return c.json({ error: "Failed to extract text from PDF" }, 500);
    }

    return c.json({
      success: true,
      text,
      textLength: text.length,
      firstChars: text.substring(0, 100) + "...",
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return c.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

async function extractTextFromPDF(url: string): Promise<string | null> {
  try {
    console.log("Fetching PDF from URL:", url);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch PDF: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log("PDF fetched, size:", arrayBuffer.byteLength);

    try {
      await PDFDocument.load(arrayBuffer);
    } catch (e) {
      throw new Error("Invalid PDF format");
    }

    const loadingTask = getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    console.log("PDF loaded, pages:", pdf.numPages);
    const numPages = pdf.numPages;
    let fullText = "";

    for (let i = 1; i <= numPages; i++) {
      console.log(`Processing page ${i} of ${numPages}`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => {
          if ((item as TextItem).str !== undefined) {
            return (item as TextItem).str;
          }
          return "";
        })
        .join(" ");
      fullText += pageText + "\n";
    }

    console.log("Text extraction complete, length:", fullText.length);
    if (fullText.trim().length === 0) {
      console.warn("Warning: Extracted text is empty");
    }
    console.log("Extracted text:", fullText.slice(0, 100) + "...");

    return fullText.slice(0, 1000);
  } catch (error) {
    console.error("PDF extraction failed:", error);
    return null;
  }
}

const port = parseInt(process.env.PORT || "3001");
console.log(`Starting PDF extraction server on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
