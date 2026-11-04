/**
 * Forecast Page controller.
 *
 * Loads server-classified monthly values and selected-row metadata, renders
 * editable Forecast months, tracks unsaved month changes, and persists manual
 * values through the ForecastPlanning PATCH endpoint.
 */
"use strict";

const FORECAST_API_URL = "/api/forecast/"; 
const FORECAST_SAVE_URL = "/api/forecast/month/"; 
const MAIN_SUMMARY_API_URL = "/api/main-summary/";

const {
    dash,
    formatUnits,
    formatUsd,
    formatDate,
    escapeHtml,
    parseNumber,
    debounce,
    requestJson,
    populateSelect,
} = window.PlanningUI;


/*
 * Monthly and dirty state own the editable table. selectedRow/endCustomerId
 * preserve the exact Main Page identity, while loading/saving coordinate UI
 * availability during API work.
 */
const state = {
    months: [],
    dirty: new Map(),

    selectedRow: null,
    endCustomerId: "",

    asOfDate: null,

    loading: false,
    saving: false,
};


const $ = (id) =>
    document.getElementById(id);


const elements = {
    status:
        $("forecastSaveStatus"),

    monthlyBody:
        $("forecastMonthlyBody"),

    totalUnits:
        $("forecastTotalUnits"),

    totalUsd:
        $("forecastTotalUsd"),

    subtitle:
        $("forecastMonthlySubtitle"),

    // Shared filters
    productId:
        $("productIdFilter"),

    customerId:
        $("customerIdFilter"),

    customerName:
        $("customerNameFilter"),

    fiscalYear:
        $("fiscalYearFilter"),

    country:
        $("countryFilter"),

    region:
        $("regionFilter"),

    opportunity:
        $("opportunityFilter"),

    resetFilters:
        $("resetFilters"),

    saveButton:
        $("saveForecastButton"),

    // Left detail panel
    detailProductId:
        $("detailProductId"),

    detailCustomerSummary:
        $("detailCustomerSummary"),

    detailIfsCustomer:
        $("detailIfsCustomer"),

    detailEndCustomer:
        $("detailEndCustomer"),

    detailCountry:
        $("detailCountry"),

    detailRegion:
        $("detailRegion"),

    detailLastUpdated:
        $("detailLastUpdated"),

    detailOpportunity:
        $("detailOpportunity"),

    detailPlanUnits:
        $("detailPlanUnits"),

    detailPlanUsd:
        $("detailPlanUsd"),

    detailBillingsUnits:
        $("detailBillingsUnits"),

    detailBillingsUsd:
        $("detailBillingsUsd"),

    detailBacklogUnits:
        $("detailBacklogUnits"),

    detailBacklogUsd:
        $("detailBacklogUsd"),

    detailForecastUnits:
        $("detailForecastUnits"),

    detailForecastUsd:
        $("detailForecastUsd"),
};


/* -------------------------------------------------
   Formatting
------------------------------------------------- */

function formatAsp(value) {
    const number =
        parseNumber(value);

    if (number === null) {
        return "—";
    }

    return new Intl.NumberFormat(
        "en-US",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        }
    ).format(number);
}


function valuesEqual(
    left,
    right
) {
    if (
        left === null
        && right === null
    ) {
        return true;
    }

    if (
        left === null
        || right === null
    ) {
        return false;
    }

    return (
        Math.abs(
            Number(left)
            - Number(right)
        )
        < 0.0000001
    );
}


function monthLabel(month) {
    if (month.month_start) {
        const value =
            String(
                month.month_start
            ).slice(0, 10);

        const date =
            new Date(
                `${value}T00:00:00Z`
            );

        if (
            !Number.isNaN(
                date.getTime()
            )
        ) {
            return new Intl.DateTimeFormat(
                "en-GB",
                {
                    month: "short",
                    year: "2-digit",
                    timeZone: "UTC",
                }
            ).format(date);
        }
    }

    if (
        month.month
        && month.year
    ) {
        return (
            `${month.month.slice(0, 3)} `
            + `'${String(month.year).slice(-2)}`
        );
    }

    return dash(month.month);
}


/* -------------------------------------------------
   Query parameters / URL
------------------------------------------------- */

/**
 * Serialize visible filters and optionally the hidden End Customer identity.
 * End Customer is omitted from the Main Summary request because that endpoint
 * returns candidate rows; it is included for the exact Forecast selection.
 */
function queryParams(
    includeEndCustomer = true
) {
    const params =
        new URLSearchParams();


    if (
        elements.productId
            .value
            .trim()
    ) {
        params.set(
            "product_id",
            elements.productId
                .value
                .trim()
        );
    }


    if (
        elements.customerId
            .value
            .trim()
    ) {
        params.set(
            "customer_id",
            elements.customerId
                .value
                .trim()
        );
    }


    if (
        elements.customerName
            .value
            .trim()
    ) {
        params.set(
            "customer_name",
            elements.customerName
                .value
                .trim()
        );
    }


    if (elements.country.value) {
        params.set(
            "country",
            elements.country.value
        );
    }


    if (elements.fiscalYear.value) {
        params.set(
            "fiscal_year",
            elements.fiscalYear.value
        );
    }


    if (elements.region.value) {
        params.set(
            "region",
            elements.region.value
        );
    }


    if (
        elements.opportunity.value
    ) {
        params.set(
            "business_opportunity",
            elements.opportunity.value
        );
    }


    if (
        includeEndCustomer
        && state.endCustomerId
    ) {
        params.set(
            "end_customer_id",
            state.endCustomerId
        );
    }


    return params;
}


function syncUrl() {
    const query =
        queryParams(true)
            .toString();

    history.replaceState(
        null,
        "",
        query
            ? `/forecast/?${query}`
            : "/forecast/"
    );
}


function setInitialSelectValue(
    select,
    value
) {
    if (
        !select
        || !value
    ) {
        return;
    }

    const exists =
        [...select.options]
            .some(
                (option) =>
                    option.value
                    === value
            );

    if (!exists) {
        const option =
            document.createElement(
                "option"
            );

        option.value =
            value;

        option.textContent =
            value;

        select.appendChild(
            option
        );
    }

    select.value =
        value;
}


function initialiseFromUrl() {
    const params =
        new URLSearchParams(
            window.location.search
        );


    elements.productId.value =
        params.get(
            "product_id"
        ) || "";


    elements.customerId.value =
        params.get(
            "customer_id"
        ) || "";


    elements.customerName.value =
        params.get(
            "customer_name"
        ) || "";


    const fiscalYear =
        params.get(
            "fiscal_year"
        );


    if (fiscalYear) {
        const exists =
            [
                ...elements
                    .fiscalYear
                    .options,
            ]
                .some(
                    (option) =>
                        option.value
                        === fiscalYear
                );

        if (exists) {
            elements
                .fiscalYear
                .value =
                fiscalYear;
        }
    }


    setInitialSelectValue(
        elements.country,
        params.get(
            "country"
        )
    );


    setInitialSelectValue(
        elements.region,
        params.get(
            "region"
        )
    );


    setInitialSelectValue(
        elements.opportunity,
        params.get(
            "business_opportunity"
        )
    );


    state.endCustomerId =
        params.get(
            "end_customer_id"
        ) || "";
}


/* -------------------------------------------------
   Page state
------------------------------------------------- */

function setStatus(
    message = "",
    type = "neutral"
) {
    if (!elements.status) {
        return;
    }

    elements.status.hidden =
        !message;

    elements.status.textContent =
        message;

    elements.status
        .classList
        .toggle(
            "is-error",
            type === "error"
        );

    elements.status
        .classList
        .toggle(
            "is-success",
            type === "success"
        );
}


function setLoading(loading) {
    state.loading =
        loading;

    elements.resetFilters.disabled =
        loading
        || state.saving;


    if (loading) {
        elements.monthlyBody.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="forecast-monthly-table__state"
                >
                    Loading forecast…
                </td>
            </tr>
        `;
    }


    updateSaveButton();
}


/* -------------------------------------------------
   Monthly data
------------------------------------------------- */

/** Normalize a monthly API row and retain its original editable values. */
function normaliseMonth(raw) {
    return {
        month:
            raw.month || "",

        year:
            raw.year || null,

        month_start:
            raw.month_start || "",

        type:
            raw.type || "unknown",

        status_label:
            raw.status_label || "—",

        editable:
            (
                raw.editable === true
            ),

        units:
            parseNumber(
                raw.units
            ),

        asp:
            parseNumber(
                raw.asp
            ),

        usd_value:
            parseNumber(
                raw.usd_value
            ),

        original_units:
            parseNumber(
                raw.units
            ),

        original_asp:
            parseNumber(
                raw.asp
            ),
    };
}


function renderMonthly() {
    if (!state.months.length) {
        elements.monthlyBody.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="forecast-monthly-table__state"
                >
                    No forecast months returned.
                </td>
            </tr>
        `;

        renderTotals();
        updateDirtyUi();

        return;
    }


    elements.monthlyBody.innerHTML =
        state.months
            .map(
                (month) => {
                    const units =
                        month.editable
                            ? `
                                <input
                                    class="forecast-input"
                                    type="number"
                                    min="0"
                                    step="1"
                                    data-field="units"
                                    value="${
                                        month.units === null
                                            ? ""
                                            : escapeHtml(
                                                month.units
                                            )
                                    }"
                                    aria-label="${escapeHtml(
                                        monthLabel(
                                            month
                                        )
                                    )} units"
                                >
                            `
                            : `
                                <span
                                    class="forecast-monthly-table__value"
                                >
                                    ${escapeHtml(
                                        formatUnits(
                                            month.units
                                        )
                                    )}
                                </span>
                            `;


                    const asp =
                        month.editable
                            ? `
                                <input
                                    class="forecast-input"
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    data-field="asp"
                                    value="${
                                        month.asp === null
                                            ? ""
                                            : escapeHtml(
                                                month.asp
                                            )
                                    }"
                                    aria-label="${escapeHtml(
                                        monthLabel(
                                            month
                                        )
                                    )} ASP"
                                >
                            `
                            : `
                                <span
                                    class="forecast-monthly-table__value"
                                >
                                    ${escapeHtml(
                                        formatAsp(
                                            month.asp
                                        )
                                    )}
                                </span>
                            `;


                    return `
                        <tr
                            data-month-row="${escapeHtml(
                                month.month_start
                            )}"
                            data-type="${escapeHtml(
                                month.type
                            )}"
                        >
                            <td
                                class="forecast-monthly-table__month"
                            >
                                ${escapeHtml(
                                    monthLabel(
                                        month
                                    )
                                )}
                            </td>

                            <td>
                                <span
                                    class="
                                        forecast-monthly-table__status
                                        forecast-monthly-table__status--${escapeHtml(
                                            month.type
                                        )}
                                    "
                                >
                                    ${escapeHtml(
                                        dash(
                                            month.status_label
                                        )
                                    )}
                                </span>
                            </td>

                            <td class="numeric">
                                ${units}
                            </td>

                            <td class="numeric">
                                ${asp}
                            </td>

                            <td
                                class="
                                    numeric
                                    forecast-monthly-table__value
                                "
                                data-usd-value
                            >
                                ${escapeHtml(
                                    formatUsd(
                                        month.usd_value
                                    )
                                )}
                            </td>
                        </tr>
                    `;
                }
            )
            .join("");


    renderTotals();
    updateDirtyUi();
}


function renderTotals() {
    if (!state.months.length) {
        elements.totalUnits.textContent =
            "—";

        elements.totalUsd.textContent =
            "—";

        return;
    }


    const totalUnits =
        state.months.reduce(
            (total, month) =>
                total
                + (
                    Number(month.units)
                    || 0
                ),
            0
        );


    const totalUsd =
        state.months.reduce(
            (total, month) =>
                total
                + (
                    Number(
                        month.usd_value
                    )
                    || 0
                ),
            0
        );


    elements.totalUnits.textContent =
        formatUnits(
            totalUnits
        );

    elements.totalUsd.textContent =
        formatUsd(
            totalUsd
        );
}


/* -------------------------------------------------
   Editing
------------------------------------------------- */

/**
 * Validate one editable month, update its USD preview, and maintain dirty state.
 * Classification and editability come from the backend; this handler does not
 * reinterpret either business rule.
 */
function handleMonthlyInput(input) {
    const row =
        input.closest(
            "tr[data-month-row]"
        );

    if (!row) {
        return;
    }


    const month =
        state.months.find(
            (item) =>
                item.month_start
                === row.dataset.monthRow
        );


    if ( !month || !month.editable ) {
        return;
    }


    const unitsInput =
        row.querySelector(
            '[data-field="units"]'
        );

    const aspInput =
        row.querySelector(
            '[data-field="asp"]'
        );


    const units =
        parseNumber(
            unitsInput.value
        );

    const asp =
        parseNumber(
            aspInput.value
        );


    /*
     * forecast_update() converts Units with int(),
     * so do not allow fractional Units in the UI.
     */
    const unitsInvalid =
        (
            units === null
            || units < 0
            || !Number.isInteger(
                units
            )
        );


    const aspInvalid =
        (
            asp === null
            || asp < 0
        );


    unitsInput
        .classList
        .toggle(
            "is-invalid",
            unitsInvalid
        );


    aspInput
        .classList
        .toggle(
            "is-invalid",
            aspInvalid
        );


    if (!unitsInvalid) {
        month.units =
            units;
    }


    if (!aspInvalid) {
        month.asp =
            asp;
    }


    /*
     * UI preview only.
     *
     * Backend remains authoritative.
     */
    month.usd_value =
        (
            !unitsInvalid
            && !aspInvalid
        )
            ? units * asp
            : null;


    const usdCell =
        row.querySelector(
            "[data-usd-value]"
        );


    if (usdCell) {
        usdCell.textContent =
            formatUsd(
                month.usd_value
            );
    }


   if (
        !unitsInvalid
        && !aspInvalid
        && (
            !valuesEqual(
                units,
                month.original_units
            )
            ||
            !valuesEqual(
                asp,
                month.original_asp
            )
        )
    ) {
        state.dirty.set(
            month.month_start,
            {
                forecastMonth:
                    month.month_start,

                units,
                asp,
            }
        );
    } else {
        state.dirty.delete(
            month.month_start
        );
    }


    const dirty =
        state.dirty.has(
            month.month_start
        );


    row.classList.toggle(
        "is-dirty",
        dirty
    );


    unitsInput.classList.toggle(
        "is-dirty",
        dirty
    );


    aspInput.classList.toggle(
        "is-dirty",
        dirty
    );


    renderTotals();
    updateDirtyUi();
}


function hasInvalidInputs() {
    return Boolean(
        elements.monthlyBody
            .querySelector(
                ".forecast-input.is-invalid"
            )
    );
}


function updateDirtyUi() {
    const count =
        state.dirty.size;

    setStatus(
        count
            ? `${count} unsaved month${count === 1 ? "" : "s"}`
            : "No unsaved changes"
    );

    updateSaveButton();
}

function updateSaveButton() {
    if (!elements.saveButton) {
        return;
    }

    elements.saveButton.disabled =
        Boolean(
            state.loading
            || state.saving
            || !state.dirty.size
            || hasInvalidInputs()
        );
}


/**
 * Persist each dirty month for the selected Product/Customer/End Customer row.
 * The PATCH payload targets manual ForecastPlanning values and contains no
 * Backlog record key or source-table update fields.
 */
async function saveForecast() {
    // Guard: we need one selected Product/Customer row
    // before a monthly forecast can be saved.
    if (!state.selectedRow) {
        setStatus(
            "Select one forecast row first.",
            "error"
        );

        return;
    }


    // Nothing changed.
    if (!state.dirty.size) {
        setStatus(
            "There are no changes to save."
        );

        return;
    }


    // Don't save invalid inputs.
    if (hasInvalidInputs()) {
        setStatus(
            "Fix invalid forecast values before saving.",
            "error"
        );

        return;
    }


    // Prevent double-click / duplicate saves.
    if (state.saving) {
        return;
    }


    state.saving = true;

    elements.resetFilters.disabled = true;

    updateSaveButton();

    setStatus(
        "Saving forecast changes…"
    );


    try {
        await Promise.all(
            [
                ...state.dirty.values(),
            ].map(
                (update) =>
                    requestJson(
                        FORECAST_SAVE_URL,
                        {
                            method: "PATCH",

                            body: {
                                product_id:
                                    state.selectedRow.product_id,

                                customer_id:
                                    state.selectedRow.customer_id,

                                end_customer_id:
                                    state.selectedRow.end_customer_id
                                    || "",

                                forecast_month:
                                    update.forecastMonth,

                                units:
                                    update.units,

                                asp:
                                    update.asp,

                                as_of_date:
                                    state.asOfDate,
                            },
                        }
                    )
            )
        );


        state.dirty.clear();


        setStatus(
            "Forecast saved successfully.",
            "success"
        );


        // Reload from the database so the UI
        // reflects what was actually persisted.
        await loadForecastPage(
            true
        );

    } catch (error) {
        console.error(
            "Forecast save failed:",
            error
        );


        setStatus(
            error.message
            || "Unable to save forecast.",
            "error"
        );

    } finally {
        state.saving = false;

        elements.resetFilters.disabled = false;

        updateSaveButton();
    }
}

/* -------------------------------------------------
   Left detail panel
------------------------------------------------- */

function customerText(
    id,
    name
) {
    const values =
        [
            id,
            name,
        ].filter(Boolean);

    return values.length
        ? values.join(" · ")
        : "—";
}


function listText(value) {
    if (Array.isArray(value)) {
        return value.length
            ? value.join(", ")
            : "—";
    }

    return dash(value);
}

function setText(
    element,
    value
) {
    if (!element) {
        return;
    }

    element.textContent =
        value ?? "—";
}

/** Render selected-row metadata returned through Main Summary. */
function renderDetail(row) {
    state.selectedRow =
        row || null;

    if (!row) {
        setText(
            elements.detailProductId,
            elements.productId?.value.trim()
            || "—"
        );

        setText(
            elements.detailCustomerSummary,
            "—"
        );

        setText(
            elements.detailIfsCustomer,
            "—"
        );

        setText(
            elements.detailEndCustomer,
            state.endCustomerId
            || "—"
        );

        setText(
            elements.detailCountry,
            elements.country?.value
            || "—"
        );

        setText(
            elements.detailRegion,
            elements.region?.value
            || "—"
        );

        setText(
            elements.detailLastUpdated,
            "—"
        );

        setText(
            elements.detailOpportunity,
            elements.opportunity?.value
            || "—"
        );

        renderDetailKpis(null);

        return;
    }

    const customer =
        customerText(
            row.customer_id,
            row.customer_name
        );

    const endCustomer =
        customerText(
            row.end_customer_id,
            row.end_customer_name
        );

    setText(
        elements.detailProductId,
        dash(row.product_id)
    );

    setText(
        elements.detailCustomerSummary,
        customer
    );

    setText(
        elements.detailIfsCustomer,
        customer
    );

    setText(
        elements.detailEndCustomer,
        endCustomer
    );

    setText(
        elements.detailCountry,
        listText(row.countries)
    );

    setText(
        elements.detailRegion,
        listText(row.regions)
    );

    setText(
        elements.detailLastUpdated,
        formatDate(
            row.last_updated
        )
    );

    setText(
        elements.detailOpportunity,
        listText(
            row.opportunity_types
        )
    );

    renderDetailKpis(row);
}

function renderDetailKpis(row) {
    setText(
        elements.detailPlanUnits,
        "—"
    );

    setText(
        elements.detailPlanUsd,
        "—"
    );

    setText(
        elements.detailBillingsUnits,
        formatUnits(
            row?.billings_units
        )
    );

    setText(
        elements.detailBillingsUsd,
        formatUsd(
            row?.billings_usd
        )
    );

    setText(
        elements.detailBacklogUnits,
        formatUnits(
            row?.backlog_units
        )
    );

    setText(
        elements.detailBacklogUsd,
        formatUsd(
            row?.backlog_usd
        )
    );

    setText(
        elements.detailForecastUnits,
        formatUnits(
            row?.forecast_units
        )
    );

    setText(
        elements.detailForecastUsd,
        formatUsd(
            row?.forecast_usd
        )
    );
}

/**
 * Resolve one exact detail row from URL/filter identity.
 * End Customer is the hidden discriminator when Product and Customer repeat.
 */
function findSelectedRow(rows) {
    const productId =
        elements.productId
            .value
            .trim();

    const customerId =
        elements.customerId
            .value
            .trim();

    const endCustomerId =
        state.endCustomerId
            .trim();


    const matches =
        rows.filter(
            (row) => (
                (
                    !productId
                    || String(
                        row.product_id
                        || ""
                    ) === productId
                )
                &&
                (
                    !customerId
                    || String(
                        row.customer_id
                        || ""
                    ) === customerId
                )
                &&
                (
                    !endCustomerId
                    || String(
                        row.end_customer_id
                        || ""
                    ) === endCustomerId
                )
            )
        );


    return matches.length === 1
        ? matches[0]
        : null;
}


/* -------------------------------------------------
   Shared filter options
------------------------------------------------- */

function populateFilterOptions(
    options = {}
) {
    populateSelect(
        elements.country,
        options.countries || [],
        "All countries"
    );


    populateSelect(
        elements.region,
        options.regions || [],
        "All regions"
    );


    populateSelect(
        elements.opportunity,
        options.opportunity_types || [],
        "All opportunities"
    );
}


/* -------------------------------------------------
   Monthly card metadata
------------------------------------------------- */

function renderMonthlyMeta() {
    const subtitleText =
        state.selectedRow
            ? [
                state.selectedRow.product_id,
                state.selectedRow.customer_id,
                state.selectedRow.end_customer_id,
            ]
                .filter(Boolean)
                .join(" · ")
            : "Filtered monthly planning position";


    setText(
        elements.subtitle,
        subtitleText
    );


}


/* -------------------------------------------------
   Load Forecast page
------------------------------------------------- */

/**
 * Load required monthly data and optional Main Page detail metadata together.
 * Monthly rendering can continue if the supporting summary request fails.
 */
async function loadForecastPage(
    preserveStatus = false
) {
    if (!preserveStatus) {
        setStatus("");
    }


    state.dirty.clear();

    setLoading(true);

    syncUrl();


    /*
     * Forecast endpoint:
     *     monthly values / editability
     *
     * Main Summary endpoint:
     *     selected-row detail metadata
     *     shared dropdown options
     */
    const forecastRequest =
        requestJson(
            `${FORECAST_API_URL}?${queryParams(
                true
            ).toString()}`
        );


    const summaryRequest =
        requestJson(
            `${MAIN_SUMMARY_API_URL}?${queryParams(
                false
            ).toString()}`
        );


    try {
        const [
            forecastResult,
            summaryResult,
        ] =
            await Promise.allSettled(
                [
                    forecastRequest,
                    summaryRequest,
                ]
            );


        /*
         * Monthly Forecast data is required.
         */
        if (
            forecastResult.status
            === "rejected"
        ) {
            throw forecastResult.reason;
        }


        const payload =
            forecastResult.value;


        state.asOfDate =
            payload.as_of_date
                ? String(
                    payload.as_of_date
                ).slice(0, 10)
                : null;


        state.months =
            Array.isArray(
                payload.months
            )
                ? payload.months.map(
                    normaliseMonth
                )
                : [];


        /*
         * Main Summary metadata is helpful,
         * but the monthly table should still work
         * if it fails.
         */
        if (
            summaryResult.status
            === "fulfilled"
        ) {
            const summary =
                summaryResult.value;


            const rows =
                Array.isArray(
                    summary.rows
                )
                    ? summary.rows
                    : [];


            populateFilterOptions(
                summary.filter_options
                || {}
            );


            renderDetail(
                findSelectedRow(
                    rows
                )
            );
        } else {
            console.warn(
                "Forecast detail metadata failed to load:",
                summaryResult.reason
            );


            renderDetail(
                null
            );
        }


        renderMonthly();

        renderMonthlyMeta();

        if (!preserveStatus) {
            setStatus("No unsaved changes");
        } else {
            setStatus("Forecast saved successfully.", "success");
        }
    } catch (error) {
        console.error(
            "Forecast page load failed:",
            error
        );


        state.months =
            [];


        renderMonthly();

        renderDetail(
            null
        );

        renderMonthlyMeta();


        setStatus(
            error.message
            || "Unable to load forecast data.",
            "error"
        );
    } finally {
        setLoading(
            false
        );

        updateSaveButton();
    }
}


/* -------------------------------------------------
   Filters
------------------------------------------------- */

function resetFilters() {
    elements.productId.value =
        "";

    elements.customerId.value =
        "";

    elements.customerName.value =
        "";

    elements.country.value =
        "";

    elements.region.value =
        "";

    elements.opportunity.value =
        "";

    state.endCustomerId =
        "";


    void loadForecastPage();
}


const autoReload =
    debounce(
        () =>
            void loadForecastPage(),
        350
    );


elements.productId.addEventListener(
    "input",
    () => {
        state.endCustomerId =
            "";

        autoReload();
    }
);


elements.customerId.addEventListener(
    "input",
    () => {
        state.endCustomerId =
            "";

        autoReload();
    }
);


elements.customerName.addEventListener(
    "input",
    autoReload
);


elements.fiscalYear.addEventListener(
    "change",
    () =>
        void loadForecastPage()
);


elements.country.addEventListener(
    "change",
    () =>
        void loadForecastPage()
);


elements.region.addEventListener(
    "change",
    () =>
        void loadForecastPage()
);


elements.opportunity.addEventListener(
    "change",
    () =>
        void loadForecastPage()
);


elements.resetFilters.addEventListener(
    "click",
    resetFilters
);


elements.saveButton?.addEventListener(
    "click",
    () =>
        void saveForecast()
);


elements.monthlyBody.addEventListener(
    "input",
    (event) => {
        const input =
            event.target.closest(
                ".forecast-input"
            );

        if (input) {
            handleMonthlyInput(
                input
            );
        }
    }
);


/* -------------------------------------------------
   Start
------------------------------------------------- */

initialiseFromUrl();

void loadForecastPage();
