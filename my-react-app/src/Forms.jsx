import Layout from "./Layout";
import React, { useEffect, useState } from "react";
import Select from "react-select";
import InspectionForm from "./InspectionForm";
import { EXPERTISE_FORM_TITLE, sameText } from "./expertiseForm";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";

// how each checklist type is shown in the picker
const TYPE_INFO = {
  INSPECTION: { group: "Inspections", badge: "Inspection", style: "bg-[#1A75BC]/10 text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]" },
  PERMIT: { group: "Permis de travail", badge: "Permis", style: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
};

const Forms = () => {
  const { user } = useAuth();
  // technicians only fill in the expertise report for now: it opens on its own, no picker
  const expertiseOnly = user?.role === "USER";
  const [selected, setSelected] = useState(null);
  const [options, setOptions] = useState(null);   // null = still loading
  const [loadError, setLoadError] = useState(false);

  // the active forms only need loading once
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const { data } = await apiClient.get("/api/v1/forms/options");
        setOptions(data.formsCount > 0 ? data.FormItem : []);
      } catch (error) {
        console.log("error while fetching for forms options", error);
        setLoadError(true);
        setOptions([]);
      }
    };
    fetchOptions();
  }, []);

  // react-select reads value/label; group the forms by type
  const formOptions = options?.map(({ type, title, id }) => ({ value: id, label: title, type })) ?? [];
  const groupedOptions = Object.keys(TYPE_INFO)
    .map((type) => ({
      label: TYPE_INFO[type].group,
      options: formOptions.filter((o) => o.type === type),
    }))
    .filter((g) => g.options.length > 0);

  if (expertiseOnly) {
    const expertise = formOptions.find((o) => sameText(o.label, EXPERTISE_FORM_TITLE));
    return (
      <Layout active="forms" wide>
        <div className="mx-auto max-w-[1000px]">
          <header>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{EXPERTISE_FORM_TITLE}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Remplissez le rapport d’expertise et envoyez-le.
            </p>
          </header>

          {options === null ? (
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Chargement du formulaire…</p>
          ) : loadError ? (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              Le formulaire n'a pas pu être chargé. Vérifiez votre connexion et rechargez la page.
            </p>
          ) : expertise ? (
            <InspectionForm key={expertise.value} id={expertise.value} />
          ) : (
            <EmptyState
              title="Rapport d’expertise indisponible"
              hint="Il n’est pas actif pour le moment. Prévenez votre responsable."
            />
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout active="forms" wide>
      <div className="mx-auto max-w-[1000px]">
        <header>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Formulaires</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choisissez une checklist d’inspection ou un permis de travail, remplissez-le et envoyez-le.
          </p>
        </header>

        <FormPicker
          selected={selected}
          setSelected={setSelected}
          options={groupedOptions}
          count={formOptions.length}
          loading={options === null}
          loadError={loadError}
        />

        {selected ? (
          // key: a new form gets a fresh, empty sheet
          <InspectionForm key={selected.value} id={selected.value} />
        ) : (
          <EmptyState />
        )}
      </div>
    </Layout>
  );
};

const FormPicker = ({ selected, setSelected, options, count, loading, loadError }) => {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="form-picker" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Formulaire à remplir
          </label>
          <Select
            inputId="form-picker"
            value={selected}
            onChange={setSelected}
            options={options}
            isLoading={loading}
            isSearchable
            isClearable
            placeholder={loading ? "Chargement des formulaires…" : "Rechercher par titre…"}
            noOptionsMessage={() => (loadError ? "Les formulaires n'ont pas pu être chargés" : "Aucun formulaire actif")}
            formatOptionLabel={(option) => <OptionLabel option={option} />}
            unstyled
            classNames={selectClassNames}
          />
        </div>
        {!loading && !loadError && (
          <p className="text-sm text-slate-500 sm:pb-2 dark:text-slate-400">
            {count} {count === 1 ? "formulaire actif" : "formulaires actifs"}
          </p>
        )}
      </div>
      {loadError && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          La liste des formulaires n'a pas pu être chargée. Vérifiez votre connexion et rechargez la page.
        </p>
      )}
    </section>
  );
};

// one option in the list: title + type badge
const OptionLabel = ({ option }) => {
  const info = TYPE_INFO[option.type];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate">{option.label}</span>
      {info && (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${info.style}`}>
          {info.badge}
        </span>
      )}
    </div>
  );
};

// react-select with `unstyled` + Tailwind classes, matching the app's inputs (light and dark)
const selectClassNames = {
  control: ({ isFocused }) =>
    `min-h-[42px] rounded-2xl border bg-white px-3 text-sm shadow-sm transition dark:bg-slate-900 ${
      isFocused
        ? "border-[#1A75BC] ring-2 ring-[#1A75BC]/20"
        : "border-slate-200 hover:border-slate-300 dark:border-slate-600"
    }`,
  valueContainer: () => "gap-1 py-1",
  placeholder: () => "text-slate-400 dark:text-slate-500",
  singleValue: () => "w-full text-slate-900 dark:text-slate-100",
  input: () => "text-slate-900 dark:text-slate-100",
  indicatorsContainer: () => "gap-1 text-slate-400",
  clearIndicator: () => "rounded-md p-1 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700",
  dropdownIndicator: () => "p-1 hover:text-slate-600",
  indicatorSeparator: () => "my-2 w-px bg-slate-200 dark:bg-slate-600",
  loadingIndicator: () => "text-[#1A75BC]",
  menu: () =>
    "mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800",
  groupHeading: () =>
    "px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500",
  option: ({ isFocused, isSelected }) =>
    `cursor-pointer px-3 py-2 text-sm ${
      isSelected
        ? "bg-[#1A75BC]/10 font-medium text-[#0F2A49] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]"
        : isFocused
        ? "bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-100"
        : "text-slate-700 dark:text-slate-300"
    }`,
  noOptionsMessage: () => "px-3 py-3 text-sm text-slate-500 dark:text-slate-400",
  loadingMessage: () => "px-3 py-3 text-sm text-slate-500 dark:text-slate-400",
};

const EmptyState = ({
  title = "Aucun formulaire choisi",
  hint = "Choisissez une checklist ou un permis ci-dessus. Il s’ouvre ici, prêt à remplir et à envoyer.",
}) => (
  <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 px-6 py-16 text-center dark:border-slate-700">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1A75BC]/10 text-2xl dark:bg-[#5BC6E8]/15">
      📋
    </div>
    <p className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
    <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p>
  </div>
);

export default Forms;
