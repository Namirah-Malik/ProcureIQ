import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { importDocument, type DocType } from "@/domain/import";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No organization context" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  const type = formData.get("type") as DocType | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!type || !["purchase_order", "invoice", "goods_receipt"].includes(type)) {
    return NextResponse.json({ error: "Invalid or missing document type" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await importDocument(session.org.id, type, file.name, file.type || "application/octet-stream", buffer);

  if (!result.ok) {
    return NextResponse.json({ error: result.error, warnings: result.warnings, documentId: result.documentId }, { status: 422 });
  }
  return NextResponse.json({ documentId: result.documentId, recordsCreated: result.recordsCreated, warnings: result.warnings });
}
