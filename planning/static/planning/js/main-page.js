    /**
     * Main Page controller for filtered rows, grouped selection, KPIs, and the
     * Product Information panel. Server-provided record keys preserve source
     * lineage when visual rows are selected or opened in Forecast.
     */
    "use strict";

    const API_URL = "/api/main-summary/";
    const PAGE_SIZE = 11;

    const {
        dash,
        formatUnits,
        formatUsd,
        formatDate,
        escapeHtml,
        debounce,
        requestJson,
        populateSelect,
    } = window.PlanningUI;

    /*
     * Row collections drive rendering and pagination. Selection is tracked at
     * both displayed-row grain and underlying record-key lineage; activeRowKey
     * identifies the one row currently shown in the detail panel.
     */
    const state = {
        rows: [],
        visibleRows: [],
        currentPage: 1,
        selectedRecordKeys: new Set(),
        selectedRowKeys: new Set(),
        activeRowKey: null,
        latestResponse: null,
    };

    const $ = (id) => document.getElementById(id);

    const elements = {
        workspace: $("workspace"),
        detailPanel: $("detailPanel"),
        tableBody: $("mainTableBody"),
        resultCount: $("resultCount"),
        tableSearch: $("tableSearch"),
        selectAllVisible: $("selectAllVisible"),
        selectionStatus: $("selectionStatus"),
        pageIndicator: $("pageIndicator"),
        previousPage: $("previousPage"),
        nextPage: $("nextPage"),

        productId: $("productIdFilter"),
        customerId: $("customerIdFilter"),
        customerName: $("customerNameFilter"),
        fiscalYear: $("fiscalYearFilter"),
        country: $("countryFilter"),
        region: $("regionFilter"),
        opportunity: $("opportunityFilter"),

        resetFilters: $("resetFilters"),
        exportButton: $("exportButton"),
        forecastNavLink: $("forecastNavLink"),

        planUnits: $("planUnits"),
        planUsd: $("planUsd"),
        billingsUnits: $("billingsUnits"),
        billingsUsd: $("billingsUsd"),
        backlogUnits: $("backlogUnits"),
        backlogUsd: $("backlogUsd"),
        forecastUnits: $("forecastUnits"),
        forecastUsd: $("forecastUsd"),
    };

    /**
     * Return the displayed-row identity used by selection and detail state.
     * End Customer keeps rows sharing Product and IFS Customer distinct.
     */
    function rowIdentity(row) {
        return [
            row.product_id ?? "",
            row.customer_id ?? "",
            row.end_customer_id ?? "",
        ].join("::");
    }

    function selectedKeysForRow(row) {
        return Array.isArray(row.record_keys) ? row.record_keys.filter(Boolean) : [];
    }

    /**
     * Serialize shared filters and, when requested, selected source lineage.
     * The visible Customer ID control intentionally covers both customer ID
     * fields on the backend; End Customer is not a separate visible filter.
     */
    function queryParams(includeSelection = false) {
        const params = new URLSearchParams();

        if (elements.productId.value.trim()) {
            params.set("product_id", elements.productId.value.trim());
        }
        if (elements.customerId.value.trim()) {
            params.set("customer_id", elements.customerId.value.trim());
        }
        if (elements.customerName.value.trim()) {
            params.set("customer_name", elements.customerName.value.trim());
        }
        if (elements.country.value) {
            params.set("country", elements.country.value);
        }
        if (elements.fiscalYear.value) {
            params.set("fiscal_year", elements.fiscalYear.value);
        }
        if (elements.region.value) {
            params.set("region", elements.region.value);
        }

        if (elements.opportunity.value) {
            params.set(
                "business_opportunity",
                elements.opportunity.value
            );
        }

        if (includeSelection && state.selectedRecordKeys.size) {
            params.set("selected", [...state.selectedRecordKeys].join(","));
        }

        return params;
    }


    /** Load grouped rows, filter options, and classified KPI totals. */
    async function loadMainPage() {
        setLoading(true);

        try {
            const payload = await requestJson( `${API_URL}?${queryParams(false).toString()}` );
            state.latestResponse = payload;
            state.rows = Array.isArray(payload.rows) ? payload.rows : [];
            state.currentPage = 1;
            clearSelection(false);

            populateCountries(
                payload.filter_options?.countries || []
            );

            populateSelect(
                elements.region,
                payload.filter_options?.regions || [],
                "All regions"
            );

            populateSelect(
                elements.opportunity,
                payload.filter_options?.opportunity_types || [],
                "All opportunities"
            );

            applyLocalTableSearch();
            renderKpis(payload.kpis || {});
        } catch (error) {
            console.error("Main page load failed:", error);
            state.rows = [];
            state.visibleRows = [];
            renderTableError("Unable to load data.");
            renderKpis({});
        } finally {
            setLoading(false);
        }
    }

    function setLoading(isLoading) {
        elements.resetFilters.disabled = isLoading;

        if (isLoading) {
            elements.resultCount.textContent = "Loading records…";
        }
    }

    function renderKpis(kpis) {
        const plan = kpis.plan || {};
        const billings = kpis.billings || {};
        const backlog = kpis.backlog || {};
        const forecast = kpis.forecast || {};

        elements.planUnits.textContent = formatUnits(plan.units);
        elements.planUsd.textContent = formatUsd(plan.usd);

        elements.billingsUnits.textContent = formatUnits(billings.units);
        elements.billingsUsd.textContent = formatUsd(billings.usd);

        elements.backlogUnits.textContent = formatUnits(backlog.units);
        elements.backlogUsd.textContent = formatUsd(backlog.usd);

        elements.forecastUnits.textContent = formatUnits(forecast.units);
        elements.forecastUsd.textContent = formatUsd(forecast.usd);
    }

    function populateCountries(countries) {
        populateSelect(
            elements.country,
            countries,
            "All countries"
        );
    }

    function applyLocalTableSearch() {
        const term = elements.tableSearch.value.trim().toLowerCase();

        if (!term) {
            state.visibleRows = [...state.rows];
        } else {
            state.visibleRows = state.rows.filter((row) => {
                const haystack = [
                    row.product_id,
                    row.customer_id,
                    row.customer_name,
                    row.end_customer_id,
                    row.end_customer_name,
                    ...(row.countries || []),
                ]
                    .filter((value) => value !== null && value !== undefined)
                    .join(" ")
                    .toLowerCase();

                return haystack.includes(term);
            });
        }

        const maxPage = Math.max(1, Math.ceil(state.visibleRows.length / PAGE_SIZE));
        state.currentPage = Math.min(state.currentPage, maxPage);

        renderTable();
    }

    function currentPageRows() {
        const start = (state.currentPage - 1) * PAGE_SIZE;
        return state.visibleRows.slice(start, start + PAGE_SIZE);
    }

    function renderTable() {
        const rows = currentPageRows();

        elements.resultCount.textContent =
            `${state.visibleRows.length.toLocaleString()} record${state.visibleRows.length === 1 ? "" : "s"}`;

        if (!rows.length) {
            elements.tableBody.innerHTML =
                '<tr><td colspan="15" class="table-state">No matching records.</td></tr>';
            renderPagination();
            updateSelectAllState();
            return;
        }

        elements.tableBody.innerHTML = rows
            .map((row) => {
                const id = rowIdentity(row);
                const selected = state.selectedRowKeys.has(id);
                const active = state.activeRowKey === id;
                const countryText =
                    Array.isArray(row.countries) && row.countries.length
                        ? row.countries.join(", ")
                        : "—";

                return `
                    <tr data-row-id="${escapeHtml(id)}"
                        class="${selected ? "is-selected" : ""} ${active ? "is-active" : ""}">
                        <td class="col-select">
                            <input class="row-checkbox"
                                   type="checkbox"
                                   data-row-id="${escapeHtml(id)}"
                                   ${selected ? "checked" : ""}
                                   aria-label="Select ${escapeHtml(row.product_id || "row")}">
                        </td>
                        <td>
                            <div class="row-primary">${escapeHtml(dash(row.product_id))}</div>
                        </td>
                        <td>
                            <div class="row-primary">${escapeHtml(dash(row.customer_id))}</div>
                            <div class="row-secondary">${escapeHtml(dash(row.customer_name))}</div>
                        </td>
                        <td>
                            <div class="row-primary">${escapeHtml(dash(row.end_customer_id))}</div>
                            <div class="row-secondary">${escapeHtml(dash(row.end_customer_name))}</div>
                        </td>
                        <td class="numeric metric-wide">${escapeHtml(formatUnits(row.billings_units))}</td>
                        <td class="numeric metric-wide">${escapeHtml(formatUsd(row.billings_usd))}</td>
                        <td class="metric-combined"> ${combinedMetricHtml( row.billings_units, row.billings_usd )} </td>
                        <td class="numeric metric-wide"> ${escapeHtml( formatUnits(row.backlog_units) )} </td> 
                        <td class="numeric metric-wide"> ${escapeHtml( formatUsd(row.backlog_usd) )} </td>
                        <td class="metric-combined"> ${combinedMetricHtml( row.backlog_units, row.backlog_usd )} </td> 
                        <td class="numeric metric-wide"> ${escapeHtml( formatUnits(row.forecast_units) )} </td> 
                        <td class="numeric metric-wide"> ${escapeHtml( formatUsd(row.forecast_usd) )} </td> 
                        <td class="metric-combined"> ${combinedMetricHtml( row.forecast_units, row.forecast_usd )} </td>
                        <td>${escapeHtml(formatDate(row.last_updated))}</td>
                        <td>${escapeHtml(countryText)}</td>
                    </tr>
                `;
            })
            .join("");

        renderPagination();
        updateSelectAllState();
    }

    function combinedMetricHtml(
        units,
        usd
    ) {
        return `
            <div class="row-primary">
                ${escapeHtml(formatUnits(units))}
            </div>

            <div class="row-secondary metric-second-value">
                ${escapeHtml(formatUsd(usd))}
            </div>
        `;
    }

    function renderPagination() {
        const pageCount = Math.max(1, Math.ceil(state.visibleRows.length / PAGE_SIZE));

        elements.pageIndicator.textContent = `${state.currentPage} / ${pageCount}`;
        elements.previousPage.disabled = state.currentPage <= 1;
        elements.nextPage.disabled = state.currentPage >= pageCount;
    }

    function renderTableError(message) {
        elements.tableBody.innerHTML =
            `<tr><td colspan="15" class="table-state">${escapeHtml(message)}</td></tr>`;
        elements.resultCount.textContent = "0 records";
        renderPagination();
    }

    function getRowByIdentity(id) {
        return state.rows.find((row) => rowIdentity(row) === id) || null;
    }

    function toggleRowSelection(row, shouldSelect) {
        const id = rowIdentity(row);
        const recordKeys = selectedKeysForRow(row);

        if (shouldSelect) {
            state.selectedRowKeys.add(id);
            recordKeys.forEach((key) => state.selectedRecordKeys.add(key));
            state.activeRowKey = id;
        } else {
            state.selectedRowKeys.delete(id);

            // Rebuild underlying record-key selection from remaining visual rows.
            state.selectedRecordKeys.clear();
            state.rows.forEach((candidate) => {
                if (state.selectedRowKeys.has(rowIdentity(candidate))) {
                    selectedKeysForRow(candidate).forEach((key) => state.selectedRecordKeys.add(key));
                }
            });

            if (state.activeRowKey === id) {
                state.activeRowKey = [...state.selectedRowKeys].at(-1) || null;
            }
        }

        updateSelectionUi();
        renderTable();
        refreshSelectedKpis();
    }

    function activateRow(row) {
        const id = rowIdentity(row);

        if (!state.selectedRowKeys.has(id)) {
            toggleRowSelection(row, true);
            return;
        }

        state.activeRowKey = id;
        updateSelectionUi();
        renderTable();
    }

    function updateSelectionUi() {
        const count = state.selectedRowKeys.size;

        elements.selectionStatus.textContent =
            count === 0
                ? "No rows selected"
                : `${count} row${count === 1 ? "" : "s"} selected`;

        if (!state.activeRowKey) {
            elements.workspace.classList.remove("has-selection");
            elements.detailPanel.setAttribute("aria-hidden", "true");
            elements.detailPanel.innerHTML =
                '<div class="detail-panel__empty">Select a row to view details.</div>';
            return;
        }

        const row = getRowByIdentity(state.activeRowKey);
        if (!row) return;

        elements.workspace.classList.add("has-selection");
        elements.detailPanel.setAttribute("aria-hidden", "false");
        renderDetailPanel(row, count);
    }

    /** Render the active grouped row and bind its Forecast navigation action. */
    function renderDetailPanel(row, selectedCount) {
        const customer = [dash(row.customer_id), dash(row.customer_name)].join(" · ");
        const endCustomer = [dash(row.end_customer_id), dash(row.end_customer_name)].join(" · ");

        elements.detailPanel.innerHTML = `
            <div class="detail-panel__header">
                <div class="detail-panel__status">
                    <span>${selectedCount > 1 ? `${selectedCount} rows selected · showing active row` : "Selected item"}</span>
                    <button id="closeDetailPanel" class="detail-panel__close" type="button" aria-label="Close detail panel">×</button>
                </div>
                <div class="detail-panel__product">${escapeHtml(dash(row.product_id))}</div>
                <div class="detail-panel__customer">${escapeHtml(customer)}</div>
            </div>

            <div class="detail-panel__body">
                <section class="detail-section">
                    <h3 class="detail-section__title">Customer</h3>
                    <div class="detail-list">
                        <div class="detail-list__row">
                            <span class="detail-list__label">IFS Customer</span>
                            <span class="detail-list__value">${escapeHtml(customer)}</span>
                        </div>
                        <div class="detail-list__row">
                            <span class="detail-list__label">IFS End Customer</span>
                            <span class="detail-list__value">${escapeHtml(endCustomer)}</span>
                        </div>
                        <div class="detail-list__row">
                            <span class="detail-list__label">Country</span>
                            <span class="detail-list__value">${escapeHtml((row.countries || []).join(", ") || "—")}</span>
                        </div>
                        <div class="detail-list__row">
                            <span class="detail-list__label">Region</span>
                            <span class="detail-list__value"> ${ escapeHtml( (row.regions || []) .join(", ") || "—" ) } </span>
                        </div>
                    </div>
                </section>

                <section class="detail-section">
                    <h3 class="detail-section__title">
                        Commercial Position
                    </h3>

                    <div class="detail-kpis">
                        ${detailKpiHtml(
                            "Plan",
                            formatUnits(null),
                            formatUsd(null),
                            "plan"
                        )}

                        ${detailKpiHtml(
                            "Billings",
                            formatUnits(row.billings_units),
                            formatUsd(row.billings_usd),
                            "billings"
                        )}

                        ${detailKpiHtml(
                            "Backlog",
                            formatUnits(row.backlog_units),
                            formatUsd(row.backlog_usd),
                            "backlog"
                        )}

                        ${detailKpiHtml(
                            "Forecast",
                            formatUnits(row.forecast_units),
                            formatUsd(row.forecast_usd),
                            "forecast"
                        )}
                    </div>
                </section>

                <section class="detail-section">
                    <h3 class="detail-section__title">Planning Details</h3>
                    <div class="detail-list">
                        <div class="detail-list__row">
                            <span class="detail-list__label">Last Updated</span>
                            <span class="detail-list__value">${escapeHtml(formatDate(row.last_updated))}</span>
                        </div>
                        <div class="detail-list__row">
                            <span class="detail-list__label">C / D</span>
                            <span class="detail-list__value">—</span>
                        </div>
                        <div class="detail-list__row">
                            <span class="detail-list__label">Opportunity Type</span>
                            <span class="detail-list__value"> ${ escapeHtml( ( row.opportunity_types || [] ).join(", ") || "—" ) } </span> </div>
                        <div class="detail-list__row">
                            <span class="detail-list__label">Notes</span>
                            <span class="detail-list__value">—</span>
                        </div>
                    </div>
                </section>
            </div>

            <div class="detail-panel__footer">
                <button id="editForecastButton" class="button button--primary" type="button">
                    Edit Forecast
                </button>
            </div>
        `;

        $("closeDetailPanel")?.addEventListener("click", () => clearSelection());
        $("editForecastButton")?.addEventListener("click", () => openForecast(row));
    }

    function detailKpiHtml(
        label,
        units,
        usd,
        type
    ) {
        return `
            <div class="detail-kpi detail-kpi--${type}">
                <div class="detail-kpi__title">
                    ${escapeHtml(label)}
                </div>

                <div class="detail-kpi__values">
                    <div>
                        <div class="detail-kpi__value">
                            ${escapeHtml(units)}
                        </div>
                        <div class="detail-kpi__label">
                            Units
                        </div>
                    </div>

                    <div>
                        <div class="detail-kpi__value">
                            ${escapeHtml(usd)}
                        </div>
                        <div class="detail-kpi__label">
                            USD
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async function refreshSelectedKpis() {
        if (!state.selectedRecordKeys.size) {
            renderKpis(state.latestResponse?.kpis || {});
            return;
        }

        try {
            const payload = await requestJson( `${API_URL}?${queryParams(true).toString()}` );
            renderKpis(payload.kpis || {});
        } catch (error) {
            console.error("Selected KPI refresh failed:", error);

            // UI remains usable. Keep previously rendered KPIs instead of inventing values.
        }
    }

    function clearSelection(refreshKpis = true) {
        state.selectedRowKeys.clear();
        state.selectedRecordKeys.clear();
        state.activeRowKey = null;
        updateSelectionUi();
        renderTable();

        if (refreshKpis) {
            renderKpis(state.latestResponse?.kpis || {});
        }
    }

    function updateSelectAllState() {
        const pageRows = currentPageRows();
        const selectedCount = pageRows.filter((row) =>
            state.selectedRowKeys.has(rowIdentity(row))
        ).length;

        elements.selectAllVisible.checked =
            pageRows.length > 0 && selectedCount === pageRows.length;

        elements.selectAllVisible.indeterminate =
            selectedCount > 0 && selectedCount < pageRows.length;
    }

    function selectAllVisible(checked) {
        currentPageRows().forEach((row) => {
            const id = rowIdentity(row);

            if (checked) {
                state.selectedRowKeys.add(id);
                selectedKeysForRow(row).forEach((key) => state.selectedRecordKeys.add(key));
                state.activeRowKey = id;
            } else {
                state.selectedRowKeys.delete(id);
            }
        });

        if (!checked) {
            state.selectedRecordKeys.clear();
            state.rows.forEach((row) => {
                if (state.selectedRowKeys.has(rowIdentity(row))) {
                    selectedKeysForRow(row).forEach((key) => state.selectedRecordKeys.add(key));
                }
            });
            state.activeRowKey = [...state.selectedRowKeys].at(-1) || null;
        }

        updateSelectionUi();
        renderTable();
        refreshSelectedKpis();
    }

    function resetFilters() {
        elements.productId.value = "";
        elements.customerId.value = "";
        elements.customerName.value = "";
        elements.country.value = "";
        elements.region.value = "";
        elements.opportunity.value = "";
        elements.tableSearch.value = "";
        state.currentPage = 1;

        loadMainPage();
    }

    const autoSearch = debounce(
        () => { state.currentPage = 1; loadMainPage();},
        350
    );

    elements.productId.addEventListener("input", autoSearch);
    elements.customerId.addEventListener("input", autoSearch);
    elements.customerName.addEventListener("input", autoSearch);
    
    elements.fiscalYear.addEventListener(
    "change",
    () => {
            state.currentPage = 1;
            loadMainPage();
        }
    );

    elements.country.addEventListener(
        "change",
        () => {
            state.currentPage = 1;
            loadMainPage();
        }
    );

    elements.region.addEventListener(
        "change",
        () => {
            state.currentPage = 1;
            loadMainPage();
        }
    );

    elements.opportunity.addEventListener(
        "change",
        () => {
            state.currentPage = 1;
            loadMainPage();
        }
    );

/**
 * Navigate to Forecast for the exact active Main Page row.
 *
 * End Customer ID is carried as hidden row identity so rows sharing Product
 * and IFS Customer remain distinguishable. The detail button and header link
 * both call this function and therefore produce the same Forecast context.
 */
function openForecast(row) {
    const params =
        new URLSearchParams();

    if (row.product_id) {
        params.set(
            "product_id",
            row.product_id
        );
    }

    if (row.customer_id) {
        params.set(
            "customer_id",
            row.customer_id
        );
    }

    if (row.end_customer_id) {
        params.set(
            "end_customer_id",
            row.end_customer_id
        );
    }

    if (elements.fiscalYear.value) {
        params.set(
            "fiscal_year",
            elements.fiscalYear.value
        );
    }

    window.location.href =
        `/forecast/?${params.toString()}`;
}

    function exportCurrentView() {
        // Export format is intentionally deferred until the agreed CSV/XLSX format is final.
        console.info("Export UI is ready; backend export format is not yet final.");
    }
    elements.resetFilters.addEventListener("click", resetFilters);
    elements.exportButton.addEventListener("click", exportCurrentView);

    elements.tableSearch.addEventListener("input", () => {
        state.currentPage = 1;
        applyLocalTableSearch();
    });

    elements.previousPage.addEventListener("click", () => {
        if (state.currentPage > 1) {
            state.currentPage -= 1;
            renderTable();
        }
    });

    elements.nextPage.addEventListener("click", () => {
        const pageCount = Math.max(1, Math.ceil(state.visibleRows.length / PAGE_SIZE));
        if (state.currentPage < pageCount) {
            state.currentPage += 1;
            renderTable();
        }
    });

    elements.selectAllVisible.addEventListener("change", (event) => {
        selectAllVisible(event.target.checked);
    });

    elements.tableBody.addEventListener("click", (event) => {
        const checkbox = event.target.closest(".row-checkbox");
        const rowElement = event.target.closest("tr[data-row-id]");

        if (!rowElement) return;

        const id = rowElement.dataset.rowId;
        const row = getRowByIdentity(id);
        if (!row) return;

        if (checkbox) {
            event.stopPropagation();
            toggleRowSelection(row, checkbox.checked);
            return;
        }

        activateRow(row);
    });

    // The header retains its generic href when no detail row is active. With an
    // active row, resolve that same row and reuse openForecast(), matching the
    // Product Information panel's Edit Forecast action exactly.
    elements.forecastNavLink
    ?.addEventListener(
        "click",
        (event) => {
            if (!state.activeRowKey) {
                return;
            }

            const row =
                getRowByIdentity(
                    state.activeRowKey
                );

            if (!row) {
                return;
            }

            event.preventDefault();

            openForecast(row);
        }
    );

    loadMainPage();
