"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { MAX_DESIGN_PARAMETERS, parameterNameProblem, type DesignParameter } from "@/lib/designParameters";
import { parseMeasurementInput } from "@/lib/measurementUnits";

type Row = { key: string; name: string; value: string; note: string };

let rowCounter = 0;
const rowKey = () => {
  rowCounter += 1;
  return `p${rowCounter}`;
};

/**
 * Fork (build 37): the design's parameters - a name, a value in the design's unit and a note. A
 * change is taken when the field is left (or with Enter), and every field that uses the name
 * follows at once.
 */
export function ParametersPanel({
  parameters,
  usage,
  unitLabel,
  onChange,
  onClose,
}: {
  parameters: readonly DesignParameter[];
  /** How many fields use each name. */
  usage: ReadonlyMap<string, number>;
  unitLabel: string;
  onChange: (next: DesignParameter[], renamed?: { from: string; to: string }) => void;
  onClose: () => void;
}) {
  useLanguage();
  const toRows = (list: readonly DesignParameter[]) => list.map((parameter) => ({ key: rowKey(), name: parameter.name, value: String(parameter.value), note: parameter.note ?? "" }));
  const [rows, setRows] = useState<Row[]>(() => toRows(parameters));
  const [problem, setProblem] = useState<string | null>(null);
  // Changes made elsewhere (undo of a rename, another window) come in when the list differs.
  useEffect(() => {
    setRows((current) => {
      const same = current.length === parameters.length && current.every((row, index) => row.name === parameters[index].name && Number(row.value) === parameters[index].value && row.note === (parameters[index].note ?? ""));
      return same ? current : toRows(parameters);
    });
  }, [parameters]);

  const commit = (nextRows: Row[], index: number, field: "name" | "value" | "note") => {
    const row = nextRows[index];
    const others = nextRows.filter((_, i) => i !== index).map((entry) => ({ name: entry.name, value: 0 }));
    const nameProblem = parameterNameProblem(row.name.trim(), others);
    if (nameProblem) {
      setProblem(t(`parameters.problem.${nameProblem}`));
      return;
    }
    const value = parseMeasurementInput(row.value);
    if (!Number.isFinite(value)) {
      setProblem(t("parameters.problem.value"));
      return;
    }
    setProblem(null);
    const next = nextRows.map((entry, i) => ({
      name: i === index ? row.name.trim() : entry.name,
      value: i === index ? value : Number(parseMeasurementInput(entry.value)),
      ...(entry.note.trim() ? { note: entry.note.trim() } : {}),
    })).filter((entry) => Number.isFinite(entry.value));
    const old = parameters[index];
    const renamed = field === "name" && old && old.name !== row.name.trim() ? { from: old.name, to: row.name.trim() } : undefined;
    onChange(next, renamed);
  };

  const setField = (index: number, field: keyof Row, text: string) => setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: text } : row)));
  const keyCommit = (index: number, field: "name" | "value" | "note") => (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
    if (event.key === "Escape") {
      setRows(toRows(parameters));
      (event.currentTarget as HTMLInputElement).blur();
    }
  };

  const add = () => {
    const taken = new Set(rows.map((row) => row.name));
    let n = rows.length + 1;
    while (taken.has(`size${n}`)) n += 1;
    const nextRows = [...rows, { key: rowKey(), name: `size${n}`, value: "10", note: "" }];
    setRows(nextRows);
    commit(nextRows, nextRows.length - 1, "value");
  };

  const remove = (index: number) => {
    const nextRows = rows.filter((_, i) => i !== index);
    setRows(nextRows);
    onChange(nextRows.map((row) => ({ name: row.name, value: Number(parseMeasurementInput(row.value)), ...(row.note.trim() ? { note: row.note.trim() } : {}) })).filter((entry) => Number.isFinite(entry.value)));
  };

  const title = t("parameters.title");
  return (
    <MovableToolPanel className="edge-modifier-panel parameters-panel" ariaLabel={title}>
      {(handleProps) => (<>
        <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
          <div>
            <strong>{title}</strong>
            <span>{t("parameters.subtitle")}</span>
          </div>
          <div className="panel-header-actions">
            <GuideHelpLink section="parameters" />
            <button type="button" aria-label={t("common.cancel")} onClick={onClose}><X size={20} /></button>
          </div>
        </div>
        {rows.length ? (
          <div className="parameters-table" role="table">
            <div className="parameters-row parameters-head" role="row">
              <span>{t("parameters.name")}</span>
              <span>{t("parameters.value", { unit: unitLabel })}</span>
              <span>{t("parameters.note")}</span>
              <span />
            </div>
            {rows.map((row, index) => {
              const used = usage.get(parameters[index]?.name ?? row.name) ?? 0;
              return (
                <div className="parameters-row" role="row" key={row.key}>
                  <input aria-label={t("parameters.name")} value={row.name} maxLength={32} spellCheck={false} onChange={(event) => setField(index, "name", event.currentTarget.value)} onBlur={() => commit(rows, index, "name")} onKeyDown={keyCommit(index, "name")} />
                  <input aria-label={t("parameters.value", { unit: unitLabel })} value={row.value} inputMode="decimal" onChange={(event) => setField(index, "value", event.currentTarget.value)} onBlur={() => commit(rows, index, "value")} onKeyDown={keyCommit(index, "value")} />
                  <input aria-label={t("parameters.note")} value={row.note} maxLength={80} placeholder={used ? t("parameters.usedIn", { count: used }) : t("parameters.unused")} onChange={(event) => setField(index, "note", event.currentTarget.value)} onBlur={() => commit(rows, index, "note")} onKeyDown={keyCommit(index, "note")} />
                  <button type="button" aria-label={t("parameters.remove")} title={used ? t("parameters.removeUsed", { count: used }) : t("parameters.remove")} onClick={() => remove(index)}><Trash2 size={15} /></button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="edge-modifier-selection-help">{t("parameters.empty")}</p>
        )}
        {problem ? <div className="edge-modifier-error" role="status">{problem}</div> : null}
        <button type="button" className="parameters-add" disabled={rows.length >= MAX_DESIGN_PARAMETERS} onClick={add}><Plus size={15} /> {t("parameters.add")}</button>
        <p className="blend-hint">{t("parameters.howTo")}</p>
      </>)}
    </MovableToolPanel>
  );
}
