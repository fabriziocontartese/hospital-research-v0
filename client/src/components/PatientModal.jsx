import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import styles from "./PatientModal.module.css";

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const PatientModal = ({
  pid,
  patient,
  owners = [],
  categories = [],
  canEdit = false,
  onSavePatient,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("responses");
  const [message, setMessage] = useState("");

  // Fetch responses
  const responsesQuery = useQuery({
    queryKey: ["patientResponses", pid],
    queryFn: async () => {
      const res = await apiClient.get(`/api/patients/${pid}/responses`);
      return res.data.responses;
    },
    enabled: Boolean(pid),
  });
  const responses = responsesQuery.data || [];

  // Fetch studies for export
  const studiesQuery = useQuery({
    queryKey: ["studiesForExport"],
    queryFn: async () => {
      const res = await apiClient.get("/api/studies");
      return res.data.studies || [];
    },
  });
const studies = useMemo(() => studiesQuery.data || [], [studiesQuery.data]);

const studyIndex = useMemo(() => {
  const map = new Map();
  for (const s of studies) map.set(String(s._id || s.id), s);
  return map;
}, [studies]);


  // Export state
  const [selectedStudyIds, setSelectedStudyIds] = useState(new Set());

  const toggleStudy = (id) => {
    setSelectedStudyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllStudies = () =>
    setSelectedStudyIds(new Set(studies.map((s) => String(s._id || s.id))));
  const clearAllStudies = () => setSelectedStudyIds(new Set());

  const getStatus = (p) =>
    p?.status || (p?.isActive === false ? "inactive" : "active");

  const initialOwnerId = useMemo(() => {
    const entry = patient?.assignedStaff?.[0];
    return typeof entry === "string" ? entry : entry?._id || entry?.id || "";
  }, [patient]);

  const [draft, setDraft] = useState(() => ({
    pid: patient?.pid || "",
    category: patient?.category || "",
    ownerId: initialOwnerId || "",
    status: getStatus(patient),
  }));

  const updateDraft = (field, value) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  const saving = useMutation({
    mutationFn: async () => {
      const payload = {
        category: draft.category || null,
        status: draft.status,
        assignedStaff: draft.ownerId ? [draft.ownerId] : [],
      };
      const nextPid = draft.pid.trim().toUpperCase();
      if (nextPid && nextPid !== patient.pid) payload.newPid = nextPid;
      await onSavePatient?.(patient, payload);
    },
    onSuccess: async () => {
      setMessage("Patient updated.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["patients"] }),
        queryClient.invalidateQueries({ queryKey: ["patientResponses", pid] }),
      ]);
    },
    onError: (err) => {
      setMessage(err?.response?.data?.error || "Update failed.");
    },
  });

  // ---------- Export CSV ----------
  const escapeCsv = (val) => {
    if (val == null) return "";
    const s = String(val);
    if (/["\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadBlob = (content, filename) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const activeSelection =
      selectedStudyIds.size > 0
        ? selectedStudyIds
        : new Set(studies.map((s) => String(s._id || s.id)));

    const filtered = responses.filter((r) =>
      activeSelection.has(String(r.studyId))
    );

    if (filtered.length === 0) {
      downloadBlob("", `${pid}-responses.csv`);
      return;
    }

    const keys = new Set();
    filtered.forEach((r) => {
      Object.keys(r.answers || {}).forEach((k) => keys.add(k));
    });
    const answerKeys = Array.from(keys).sort();

    const staticHeaders = ["pid", "study_code", "study_title", "form", "authored_at"];
    const header = [...staticHeaders, ...answerKeys].map(escapeCsv).join(",");

    const rows = filtered.map((r) => {
      const study = studyIndex.get(String(r.studyId));
      const formTitle = r.formId?.schema?.title || r.formId?.version || "";
      const authoredAt = r.authoredAt ? new Date(r.authoredAt).toISOString() : "";
      const base = [
        pid,
        study?.code || "",
        study?.title || "",
        formTitle,
        authoredAt,
      ];
      const ans = r.answers || {};
      const dynamic = answerKeys.map((k) => {
        const v = ans[k];
        if (Array.isArray(v)) return escapeCsv(v.join("; "));
        if (v && typeof v === "object") return escapeCsv(JSON.stringify(v));
        return escapeCsv(v);
      });
      return [...base.map(escapeCsv), ...dynamic].join(",");
    });

    const csv = [header, ...rows].join("\n");
    downloadBlob(csv, `${pid}-responses.csv`);
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader
            actions={
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            }
          >
            <CardTitle>{patient?.pid || pid}</CardTitle>
            <CardDescription>Pseudonymized patient overview</CardDescription>
          </CardHeader>

          <CardContent className={styles.body}>
            {/* --- Header summary --- */}
            <div className={styles.summary}>
              <div>
                <span className={styles.label}>Category</span>
                <div className={styles.value}>
                  {patient?.category ? (
                    <Badge variant="primary">{patient.category}</Badge>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div>
                <span className={styles.label}>Primary staff</span>
                <div className={styles.value}>
                  {patient?.assignedStaff?.[0]
                    ? patient.assignedStaff[0].displayName ||
                      patient.assignedStaff[0].email
                    : "Unassigned"}
                </div>
              </div>
              <div>
                <span className={styles.label}>Status</span>
                <div className={styles.value}>
                  <Badge
                    variant={
                      getStatus(patient) === "inactive" ? "neutral" : "success"
                    }
                  >
                    {getStatus(patient) === "inactive" ? "Inactive" : "Active"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* --- Tabs --- */}
            <div className={styles.tabs}>
              {["responses", "edit", "export"].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${styles.tab} ${
                    tab === t ? styles.active : ""
                  }`}
                  onClick={() => {
                    if (t === "export" && selectedStudyIds.size === 0) {
                      selectAllStudies();
                    }
                    setTab(t);
                  }}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* --- Responses tab --- */}
            {tab === "responses" && (
              <div className={styles.panel}>
                {responsesQuery.isLoading ? (
                  <div className={styles.empty}>Loading responses…</div>
                ) : responses.length === 0 ? (
                  <div className={styles.empty}>No responses submitted yet.</div>
                ) : (
                  <div className={styles.responseList}>
                    {responses.map((r) => (
                      <div key={r._id} className={styles.responseCard}>
                        <div className={styles.responseHeader}>
                          <h3>{r.formId?.schema?.title || r.formId?.version}</h3>
                          <span className={styles.meta}>
                            Submitted {new Date(r.authoredAt).toLocaleString()}
                          </span>
                        </div>
                        <div className={styles.responseBody}>
                          {Object.entries(r.answers || {}).map(([k, v]) => (
                            <div key={k} className={styles.answerRow}>
                              <span className={styles.answerLabel}>{k}</span>
                              <span className={styles.answerValue}>
                                {Array.isArray(v) ? v.join(", ") : String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* --- Edit tab --- */}
            {tab === "edit" && (
              <div className={styles.panel}>
                {!canEdit ? (
                  <div className={styles.empty}>View-only access.</div>
                ) : (
                  <form
                    className={styles.form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      setMessage("");
                      saving.mutate();
                    }}
                  >
                    <label>
                      Pseudonym (PID)
                      <Input
                        value={draft.pid}
                        onChange={(e) =>
                          updateDraft("pid", e.target.value.toUpperCase())
                        }
                        placeholder="PID-2025-001"
                      />
                    </label>

                    <label>
                      Category
                      <select
                        value={draft.category}
                        onChange={(e) =>
                          updateDraft("category", e.target.value)
                        }
                        className={styles.select}
                      >
                        <option value="">No category</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Owner
                      <select
                        value={draft.ownerId}
                        onChange={(e) =>
                          updateDraft("ownerId", e.target.value)
                        }
                        className={styles.select}
                      >
                        <option value="">Unassigned</option>
                        {owners.map((o) => (
                          <option key={o._id || o.id} value={o._id || o.id}>
                            {o.displayName || o.email} ({o.role})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Status
                      <select
                        value={draft.status}
                        onChange={(e) =>
                          updateDraft("status", e.target.value)
                        }
                        className={styles.select}
                      >
                        {statusOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {message && <div className={styles.banner}>{message}</div>}

                    <div className={styles.actions}>
                      <Button type="button" variant="ghost" onClick={onClose}>
                        Close
                      </Button>
                      <Button type="submit" disabled={saving.isLoading}>
                        {saving.isLoading ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* --- Export tab --- */}
            {tab === "export" && (
              <div className={styles.panel}>
                {studiesQuery.isLoading ? (
                  <div className={styles.empty}>Loading studies…</div>
                ) : studies.length === 0 ? (
                  <div className={styles.empty}>No studies available.</div>
                ) : (
                  <>
                    <div className={styles.exportHeader}>
                      <div className={styles.exportActions}>
                        <Button size="sm" variant="ghost" onClick={selectAllStudies}>
                          Select all
                        </Button>
                        <Button size="sm" variant="ghost" onClick={clearAllStudies}>
                          Clear
                        </Button>
                      </div>
                    </div>

                    <div className={styles.checklist}>
                      {studies.map((s) => {
                        const id = String(s._id || s.id);
                        const checked =
                          selectedStudyIds.size === 0
                            ? true
                            : selectedStudyIds.has(id);
                        return (
                          <label key={id} className={styles.checkItem}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleStudy(id)}
                            />
                            <span className={styles.checkLabelText}>
                              {s.code ? `${s.code} — ${s.title}` : s.title}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <div className={styles.actions}>
                      <Button onClick={handleExportCsv}>Export CSV</Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PatientModal;
