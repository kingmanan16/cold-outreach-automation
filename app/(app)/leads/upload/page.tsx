"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import Link from "next/link";

type FieldMapping =
  | "skip"
  | "email"
  | "firstName"
  | "lastName"
  | "company"
  | "custom";

type ColumnConfig = {
  csvColumn: string;
  mapping: FieldMapping;
  customName: string;
};

type UploadResult = {
  created: number;
  duplicatesSkipped: number;
  listId: string;
};

export default function LeadsUploadPage() {
  const router = useRouter();
  const [listName, setListName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);

  function handleFile(file: File | null) {
    setError(null);
    setResult(null);
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        if (parsed.errors.length > 0) {
          setError(parsed.errors[0]?.message ?? "Failed to parse CSV");
          return;
        }
        const cols = parsed.meta.fields ?? [];
        if (cols.length === 0) {
          setError("CSV has no columns");
          return;
        }
        setHeaders(cols);
        setRows(parsed.data);
        setColumns(
          cols.map((csvColumn) => {
            const mapping = guessMapping(csvColumn);
            return {
              csvColumn,
              mapping,
              customName: mapping === "custom" ? csvColumn : "",
            };
          })
        );
      },
    });
  }

  function updateColumn(index: number, patch: Partial<ColumnConfig>) {
    setColumns((prev) =>
      prev.map((col, i) => (i === index ? { ...col, ...patch } : col))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!listName.trim()) {
      setError("Please enter a name for this upload batch");
      return;
    }

    const emailMapped = columns.some((c) => c.mapping === "email");
    if (!emailMapped) {
      setError("You must map one column to email");
      return;
    }

    const customWithoutName = columns.find(
      (c) => c.mapping === "custom" && !(c.customName.trim() || c.csvColumn.trim())
    );
    if (customWithoutName) {
      setError(
        `Enter a custom field name for column "${customWithoutName.csvColumn}"`
      );
      return;
    }

    const payloadRows = rows.map((row) => {
      const mapped: {
        email: string;
        firstName?: string;
        lastName?: string;
        company?: string;
        customFields: Record<string, string>;
      } = { email: "", customFields: {} };

      for (const col of columns) {
        const value = String(row[col.csvColumn] ?? "").trim();
        if (!value || col.mapping === "skip") continue;
        if (col.mapping === "email") mapped.email = value;
        else if (col.mapping === "firstName") mapped.firstName = value;
        else if (col.mapping === "lastName") mapped.lastName = value;
        else if (col.mapping === "company") mapped.company = value;
        else if (col.mapping === "custom") {
          const fieldName = col.customName.trim() || col.csvColumn.trim();
          mapped.customFields[fieldName] = value;
        }
      }
      return mapped;
    });

    setSubmitting(true);
    try {
      const res = await fetch("/api/leads/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listName: listName.trim(), rows: payloadRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setResult(data);
      router.refresh();
    } catch {
      setError("Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Upload leads</h1>
        <Link href="/leads" className="text-sm text-zinc-600 hover:text-zinc-900">
          Back to leads
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            List name
          </label>
          <input
            type="text"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            placeholder="e.g. March outreach batch"
            className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            CSV file
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </div>

        {headers.length > 0 && (
          <>
            <div>
              <h2 className="mb-2 text-sm font-medium text-zinc-900">
                Column mapping
              </h2>
              <div className="overflow-hidden rounded-md border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-zinc-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">CSV column</th>
                      <th className="px-3 py-2 font-medium">Map to</th>
                      <th className="px-3 py-2 font-medium">Custom field name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((col, index) => (
                      <tr key={col.csvColumn} className="border-t border-zinc-100">
                        <td className="px-3 py-2 text-zinc-900">{col.csvColumn}</td>
                        <td className="px-3 py-2">
                          <select
                            value={col.mapping}
                            onChange={(e) => {
                              const mapping = e.target.value as FieldMapping;
                              updateColumn(index, {
                                mapping,
                                customName:
                                  mapping === "custom"
                                    ? col.customName || col.csvColumn
                                    : col.customName,
                              });
                            }}
                            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          >
                            <option value="skip">Skip</option>
                            <option value="email">email</option>
                            <option value="firstName">firstName</option>
                            <option value="lastName">lastName</option>
                            <option value="company">company</option>
                            <option value="custom">custom field</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {col.mapping === "custom" ? (
                            <input
                              type="text"
                              value={col.customName}
                              onChange={(e) =>
                                updateColumn(index, {
                                  customName: e.target.value,
                                })
                              }
                              placeholder="Field name"
                              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                            />
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-medium text-zinc-900">
                Preview (first 5 rows)
              </h2>
              <div className="overflow-x-auto rounded-md border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-zinc-600">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t border-zinc-100">
                        {headers.map((h) => (
                          <td key={h} className="whitespace-nowrap px-3 py-2 text-zinc-800">
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {rows.length} rows parsed from CSV
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Uploading…" : "Upload leads"}
            </button>
          </>
        )}
      </form>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-medium">Upload complete</p>
          <p>
            {result.created} leads created, {result.duplicatesSkipped} duplicates
            skipped.
          </p>
          <div className="mt-2 flex gap-3">
            <Link href="/leads" className="underline">
              View lists
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function guessMapping(column: string): FieldMapping {
  const c = column.toLowerCase().replace(/[\s_-]/g, "");
  if (c === "email" || c === "emailaddress") return "email";
  if (c === "firstname" || c === "first") return "firstName";
  if (c === "lastname" || c === "last") return "lastName";
  if (c === "name" || c === "fullname" || c === "contactname") return "firstName";
  if (c === "company" || c === "companyname") return "company";
  // Any other CSV column becomes a custom field (usable as {{Column Name}})
  return "custom";
}
