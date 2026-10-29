"use strict";

const API = {
  customers: "/api/customers/",
  summary: "/api/forecast-summary/",

  detail(productId, customerId) {
    return (
      `/api/forecast-detail/${encodeURIComponent(productId)}/` +
      `${encodeURIComponent(customerId)}/`
    );
  },
};

const state = {
  customers: new Map(),
  summary: [],
  filtered: [],
  selected: null,
  changed: new Map(),
  page: 1,
  pageSize: 10,
};

const numberFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
});

const moneyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});


/**
 * Return the first matching element.
 *
 * @param {string} selector - CSS selector.
 * @param {Document|HTMLElement} parent - Search parent.
 * @returns {HTMLElement|null} Matching element.
 */
function $(selector, parent = document) {
  return parent.querySelector(selector);
}


/**
 * Convert API or input data into a number.
 *
 * @param {*} value - Value to parse.
 * @returns {number} Parsed number.
 */
function numberValue(value) {
  const cleaned = String(value ?? "")
    .replace(/[$,\s]/g, "");

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : 0;
}


/**
 * Read a value using a list of possible object paths.
 *
 * @param {object} object - Source object.
 * @param {string[]} paths - Possible paths.
 * @param {*} fallback - Fallback value.
 * @returns {*} Matching value.
 */
function valueAt(object, paths, fallback = "") {
  for (const path of paths) {
    let value = object;

    for (const part of path.split(".")) {
      value = value?.[part];
    }

    if (
      value !== undefined &&
      value !== null
    ) {
      return value;
    }
  }

  return fallback;
}


/**
 * Extract an array from common DRF response shapes.
 *
 * @param {*} payload - Parsed API response.
 * @param {string[]} preferredKeys - Preferred response keys.
 * @returns {object[]} Extracted records.
 */
function extractRows(payload, preferredKeys = []) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return [];
  }

  const keys = [
    ...preferredKeys,
    "results",
    "summary",
    "months",
    "monthly_data",
    "monthly_forecast",
    "forecast_detail",
    "detail",
    "records",
    "rows",
    "data",
  ];

  for (const key of keys) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value;
    }

    if (
      value &&
      typeof value === "object"
    ) {
      for (const nestedKey of keys) {
        if (Array.isArray(value[nestedKey])) {
          return value[nestedKey];
        }
      }
    }
  }

  return [];
}


/**
 * Return the selected fiscal-year starting year.
 *
 * @returns {number} Fiscal year.
 */
function fiscalYear() {
  return Number(
    $("#fiscal-year")?.value,
  ) || 2026;
}


/**
 * Read Django's CSRF token.
 *
 * @returns {string} CSRF token.
 */
function csrfToken() {
  const inputToken = document.querySelector(
    "input[name='csrfmiddlewaretoken']",
  )?.value;

  if (inputToken) {
    return inputToken;
  }

  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) =>
      item.startsWith("csrftoken="),
    );

  if (!cookie) {
    return "";
  }

  return decodeURIComponent(
    cookie.slice("csrftoken=".length),
  );
}


/**
 * Send an HTTP request to the Django API.
 *
 * @param {string} url - Request URL.
 * @param {RequestInit} options - Fetch options.
 * @returns {Promise<*>} Parsed response body.
 */
async function apiRequest(
  url,
  options = {},
) {
  const method = String(
    options.method || "GET",
  ).toUpperCase();

  const headers = new Headers(
    options.headers || {},
  );

  headers.set(
    "Accept",
    "application/json",
  );

  if (options.body !== undefined) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  if (
    !["GET", "HEAD", "OPTIONS"].includes(
      method,
    )
  ) {
    const token = csrfToken();

    if (token) {
      headers.set(
        "X-CSRFToken",
        token,
      );
    }
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    method,
    headers,
  });

  const contentType =
    response.headers.get("content-type") || "";

  const payload = contentType.includes(
    "application/json",
  )
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      payload?.detail ||
      payload?.error ||
      payload?.message ||
      (
        typeof payload === "string"
          ? payload
          : ""
      ) ||
      `HTTP ${response.status}`;

    throw new Error(message);
  }

  return payload;
}


/**
 * Display a status or error message.
 *
 * @param {string} message - Message to display.
 * @param {boolean} isError - Error state.
 */
function showStatus(
  message = "",
  isError = false,
) {
  let status = $("#api-status");

  if (!status) {
    status = document.createElement("p");

    status.id = "api-status";
    status.className = "app-status";
    status.setAttribute(
      "role",
      "status",
    );

    $("#forecast-filters")?.before(status);
  }

  status.hidden = !message;
  status.textContent = message;

  status.classList.toggle(
    "is-error",
    isError,
  );

  status.classList.toggle(
    "is-success",
    Boolean(message) && !isError,
  );
}


/**
 * Normalise one customer API record.
 *
 * @param {object} row - Customer record.
 * @returns {object} Normalised customer.
 */
function normaliseCustomer(row) {
  return {
    id: String(
      valueAt(
        row,
        ["customer_id", "id"],
      ),
    ),

    name: String(
      valueAt(
        row,
        ["customer_name", "name"],
      ),
    ),

    region: String(
      valueAt(
        row,
        ["region"],
      ),
    ),

    opportunityType: String(
      valueAt(
        row,
        ["opportunity_type"],
      ),
    ),
  };
}


/**
 * Normalise one forecast-summary record.
 *
 * @param {object} row - Summary record.
 * @returns {object} Normalised summary record.
 */
function normaliseSummary(row) {
  const customerValue =
    valueAt(
      row,
      [
        "customer_id",
        "customer.customer_id",
        "customer.id",
        "customer__customer_id",
        "customer",
      ],
      "",
    );

  const customerId =
    typeof customerValue === "object"
      ? String(
          customerValue.customer_id ||
          customerValue.id ||
          "",
        )
      : String(customerValue);

  const customer =
    state.customers.get(customerId) || {};

  return {
    productId: String(
      valueAt(
        row,
        ["product_id"],
      ),
    ),

    productName: String(
      valueAt(
        row,
        ["product_name"],
      ),
    ),

    customerId,

    customerName: String(
      valueAt(
        row,
        [
          "customer_name",
          "customer.customer_name",
          "customer.name",
          "customer__customer_name",
        ],
        customer.name || "",
      ),
    ),

    region: String(
      valueAt(
        row,
        [
          "region",
          "customer.region",
          "customer__region",
        ],
        customer.region || "",
      ),
    ),

    opportunity: String(
      valueAt(
        row,
        [
          "opportunity_type",
          "customer.opportunity_type",
          "customer__opportunity_type",
        ],
        customer.opportunity || "",
      ),
    ),

    planUnits: numberValue(
      valueAt(
        row,
        [
          "plan_units",
          "total_plan_units",
          "sum_plan_units",
        ],
      ),
    ),

    planDollars: numberValue(
      valueAt(
        row,
        [
          "plan_dollars",
          "total_plan_dollars",
          "sum_plan_dollars",
        ],
      ),
    ),

    billingsUnits: numberValue(
      valueAt(
        row,
        [
          "billings_units",
          "total_billings_units",
          "sum_billings_units",
        ],
      ),
    ),

    billingsDollars: numberValue(
      valueAt(
        row,
        [
          "billings_dollars",
          "total_billings_dollars",
          "sum_billings_dollars",
        ],
      ),
    ),

    backlogUnits: numberValue(
      valueAt(
        row,
        [
          "backlog_unit",
          "backlog_units",
          "total_backlog_unit",
          "total_backlog_units",
          "sum_backlog_unit",
          "sum_backlog_units",
        ],
      ),
    ),

    backlogDollars: numberValue(
      valueAt(
        row,
        [
          "backlog_dollars",
          "total_backlog_dollars",
          "sum_backlog_dollars",
        ],
      ),
    ),
  };
}


/**
 * Populate a select field.
 *
 * @param {string} selector - Select selector.
 * @param {string[]} values - Option values.
 * @param {string} firstLabel - Default label.
 */
function populateSelect(
  selector,
  values,
  firstLabel,
) {
  const select = $(selector);

  if (!select) {
    return;
  }

  const currentValue = select.value;

  const uniqueValues = [
    ...new Set(
      values.filter(Boolean),
    ),
  ].sort();

  select.replaceChildren();

  const firstOption =
    document.createElement("option");

  firstOption.value = "";
  firstOption.textContent = firstLabel;

  select.appendChild(firstOption);

  for (const value of uniqueValues) {
    const option =
      document.createElement("option");

    option.value = value;
    option.textContent = value;

    select.appendChild(option);
  }

  if (
    uniqueValues.includes(currentValue)
  ) {
    select.value = currentValue;
  }
}


/**
 * Load customer data for filters and details.
 *
 * A failure here does not prevent the forecast data
 * from loading.
 *
 * @returns {Promise<void>}
 */
async function loadCustomers() {
  try {
    const payload = await apiRequest(
      API.customers,
    );

    console.log(
      "Customers response:",
      payload,
    );

    const customers =
      extractRows(payload)
        .map(normaliseCustomer);

    state.customers.clear();

    for (const customer of customers) {
      state.customers.set(
        customer.id,
        customer,
      );
    }

    populateSelect(
      "#region",
      customers.map(
        (customer) => customer.region,
      ),
      "All Regions",
    );

    populateSelect(
      "#business-opportunities",
      customers.map(
        (customer) =>
          customer.opportunityType,
      ),
      "All Opportunities",
    );
  } catch (error) {
    console.warn(
      "Customer data was not loaded:",
      error,
    );
  }
}


/**
 * Load summary data for the selected fiscal year.
 *
 * @returns {Promise<void>}
 */
async function loadSummary() {
  showStatus(
    "Loading forecast data...",
  );

  const parameters =
    new URLSearchParams({
      fiscal_year: String(fiscalYear()),
    });

  const payload = await apiRequest(
    `${API.summary}?${parameters}`,
  );

  console.log(
    "Forecast summary response:",
    payload,
  );

  const rows = extractRows(
    payload,
    ["summary"],
  ).map(normaliseSummary);

  state.summary = rows;
  state.filtered = rows;
  state.selected = null;
  state.changed.clear();
  state.page = 1;

  applyFilters();

  if (state.filtered.length > 0) {
    await selectSummaryRow(
      state.filtered[0],
    );
  } else {
    clearDetails();
    renderMonthly([]);

    showStatus(
      "No forecast data was returned for this fiscal year.",
      true,
    );
  }
}


/**
 * Apply product, customer, region, and opportunity filters.
 */
function applyFilters() {
  const productText =
    $("#product-id")
      ?.value
      .trim()
      .toLowerCase() || "";

  const customerText =
    $("#customer-id")
      ?.value
      .trim()
      .toLowerCase() || "";

  const region =
    $("#region")?.value || "";

  const opportunity =
    $("#business-opportunities")
      ?.value || "";

  state.filtered =
    state.summary.filter((row) => {
      const productMatches =
        !productText ||
        row.productId
          .toLowerCase()
          .includes(productText) ||
        row.productName
          .toLowerCase()
          .includes(productText);

      const customerMatches =
        !customerText ||
        row.customerId
          .toLowerCase()
          .includes(customerText) ||
        row.customerName
          .toLowerCase()
          .includes(customerText);

      const regionMatches =
        !region ||
        row.region === region;

      const opportunityMatches =
        !opportunity ||
        row.opportunityType === opportunity;

      return (
        productMatches &&
        customerMatches &&
        regionMatches &&
        opportunityMatches
      );
    });

  const totalPages = Math.max(
    1,
    Math.ceil(
      state.filtered.length /
      state.pageSize,
    ),
  );

  state.page = Math.min(
    state.page,
    totalPages,
  );

  renderKpis();
  renderSummary();
}


/**
 * Render KPI totals.
 */
function renderKpis() {
  const totals =
    state.filtered.reduce(
      (result, row) => {
        result.planUnits +=
          row.planUnits;

        result.planDollars +=
          row.planDollars;

        result.billingsUnits +=
          row.billingsUnits;

        result.billingsDollars +=
          row.billingsDollars;

        result.backlogUnits +=
          row.backlogUnits;

        result.backlogDollars +=
          row.backlogDollars;

        return result;
      },
      {
        planUnits: 0,
        planDollars: 0,
        billingsUnits: 0,
        billingsDollars: 0,
        backlogUnits: 0,
        backlogDollars: 0,
      },
    );

  $("#plan-units-kpi").textContent =
    numberFormatter.format(
      totals.planUnits,
    );

  $("#plan-dollars-kpi").textContent =
    moneyFormatter.format(
      totals.planDollars,
    );

  $("#billings-units-kpi").textContent =
    numberFormatter.format(
      totals.billingsUnits,
    );

  $("#billings-dollars-kpi").textContent =
    moneyFormatter.format(
      totals.billingsDollars,
    );

  $("#backlog-units-kpi").textContent =
    numberFormatter.format(
      totals.backlogUnits,
    );

  $("#backlog-dollars-kpi").textContent =
    moneyFormatter.format(
      totals.backlogDollars,
    );
}


/**
 * Render the summary table.
 */
function renderSummary() {
  const body =
    $("#summary-table-body");

  if (!body) {
    return;
  }

  const start =
    (state.page - 1) *
    state.pageSize;

  const pageRows =
    state.filtered.slice(
      start,
      start + state.pageSize,
    );

  body.replaceChildren();

  if (pageRows.length === 0) {
    const row =
      document.createElement("tr");

    row.className = "empty-row";

    const cell =
      document.createElement("td");

    cell.colSpan = 10;
    cell.textContent =
      "No matching forecast rows.";

    row.appendChild(cell);
    body.appendChild(row);
  }

  for (const item of pageRows) {
    const row =
      document.createElement("tr");

    row.dataset.selectable = "true";

    const isSelected =
      state.selected?.productId ===
        item.productId &&
      state.selected?.customerId ===
        item.customerId;

    row.classList.toggle(
      "selected-row",
      isSelected,
    );

    const checkboxCell =
      document.createElement("td");

    const checkbox =
      document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.checked = isSelected;
    checkbox.tabIndex = -1;

    checkboxCell.appendChild(checkbox);
    row.appendChild(checkboxCell);

    const values = [
      item.productId,
      item.customerName,
      item.customerId,
      numberFormatter.format(
        item.planUnits,
      ),
      moneyFormatter.format(
        item.planDollars,
      ),
      numberFormatter.format(
        item.billingsUnits,
      ),
      moneyFormatter.format(
        item.billingsDollars,
      ),
      numberFormatter.format(
        item.backlogUnits,
      ),
      moneyFormatter.format(
        item.backlogDollars,
      ),
    ];

    for (const value of values) {
      const cell =
        document.createElement("td");

      cell.textContent =
        value || "—";

      row.appendChild(cell);
    }

    row.addEventListener(
      "click",
      () => {
        void selectSummaryRow(item);
      },
    );

    body.appendChild(row);
  }

  const first =
    state.filtered.length
      ? start + 1
      : 0;

  const last = Math.min(
    start + pageRows.length,
    state.filtered.length,
  );

  $("#result-count").textContent =
    `Showing ${first} to ${last} ` +
    `of ${state.filtered.length} results`;

  renderPagination();
}


/**
 * Render pagination buttons.
 */
function renderPagination() {
  const container =
    $("#pagination");

  if (!container) {
    return;
  }

  const totalPages = Math.max(
    1,
    Math.ceil(
      state.filtered.length /
      state.pageSize,
    ),
  );

  container.replaceChildren();

  for (
    let page = 1;
    page <= totalPages;
    page += 1
  ) {
    const button =
      document.createElement("button");

    button.type = "button";
    button.textContent = String(page);

    button.classList.toggle(
      "active-page",
      page === state.page,
    );

    button.addEventListener(
      "click",
      () => {
        state.page = page;
        renderSummary();
      },
    );

    container.appendChild(button);
  }
}


/**
 * Select a summary row and load monthly detail.
 *
 * @param {object} row - Selected summary record.
 * @returns {Promise<void>}
 */
async function selectSummaryRow(row) {
  state.selected = row;
  state.changed.clear();

  renderSummary();
  renderDetails(row, []);

  showStatus(
    `Loading ${row.productId} / ` +
    `${row.customerId}...`,
  );

  const parameters =
    new URLSearchParams({
      fiscal_year: String(fiscalYear()),
    });

  try {
    const payload = await apiRequest(
      `${API.detail(
        row.productId,
        row.customerId,
      )}?${parameters}`,
    );

    console.log(
      "Forecast detail response:",
      payload,
    );

    const records = extractRows(
      payload,
      [
        "months",
        "monthly_data",
        "monthly_forecast",
        "forecast_detail",
        "detail",
      ],
    );

    renderDetails(row, records);
    renderMonthly(records);
    showStatus("");
  } catch (error) {
    renderMonthly([]);

    showStatus(
      error.message,
      true,
    );

    console.error(error);
  }
}


/**
 * Render selected-item details.
 *
 * @param {object} row - Selected summary record.
 * @param {object[]} records - Monthly records.
 */
function renderDetails(row, records) {
  const customer =
    state.customers.get(
      row.customerId,
    ) || {};

  const dates = records
    .map((record) =>
      String(
        valueAt(
          record,
          [
            "date_entered",
            "date",
          ],
        ),
      ),
    )
    .filter(Boolean)
    .sort();

  $("#detail-product-name").textContent =
    row.productName ||
    row.productId;

  $("#detail-customer-name").textContent =
    row.customerName ||
    customer.name ||
    row.customerId;

  $("#detail-customer-id").textContent =
    row.customerId;

  $("#detail-region").textContent =
    row.region ||
    customer.region ||
    "—";

  $("#detail-currency").textContent =
    "USD";

  $("#detail-last-updated").textContent =
    dates.at(-1) || "—";

  $("#detail-business-opportunity").textContent =
    customer.opportunityType ||
    "—";
  $("#selected-product-link").textContent =
    row.productName ||
    row.productId;

  $("#selected-customer-link").textContent =
    row.customerName ||
    row.customerId;
}


/**
 * Clear the selected-item details.
 */
function clearDetails() {
  $("#detail-product-name").textContent =
    "—";

  $("#detail-customer-name").textContent =
    "—";

  $("#detail-customer-id").textContent =
    "—";

  $("#detail-region").textContent =
    "—";

  $("#detail-currency").textContent =
    "USD";

  $("#detail-last-updated").textContent =
    "—";
  
  $("#detail-business-opportunity").textContent =
    "—";
  $("#selected-product-link").textContent =
    "Select a product";

  $("#selected-customer-link").textContent =
    "Select a customer";
}


/**
 * Return the twelve fiscal months.
 *
 * @returns {string[]} YYYY-MM values.
 */
function fiscalMonths() {
  return Array.from(
    { length: 12 },
    (_, index) => {
      const date = new Date(
        Date.UTC(
          fiscalYear(),
          3 + index,
          1,
        ),
      );

      return date
        .toISOString()
        .slice(0, 7);
    },
  );
}


/**
 * Determine a detail record's month.
 *
 * @param {object} record - Monthly record.
 * @param {number} index - Record position.
 * @returns {string} YYYY-MM month.
 */
function recordMonth(record, index) {
  const date = String(
    valueAt(
      record,
      [
        "date_entered",
        "date",
        "month_date",
        "month",
      ],
    ),
  );

  const match = date.match(
    /^(\d{4})-(\d{2})/,
  );

  if (match) {
    return `${match[1]}-${match[2]}`;
  }

  return fiscalMonths()[index] || "";
}


/**
 * Render the monthly forecast table.
 *
 * @param {object[]} records - Monthly records.
 */
function renderMonthly(records) {
  const months = fiscalMonths();

  const recordsByMonth =
    new Map();

  records.forEach(
    (record, index) => {
      recordsByMonth.set(
        recordMonth(record, index),
        record,
      );
    },
  );

  const header =
    $("#forecast-month-headers");

  const body =
    $("#forecast-month-body");

  if (!header || !body) {
    return;
  }

  header.replaceChildren(
    document.createElement("th"),
  );

  for (const month of months) {
    const cell =
      document.createElement("th");

    const date = new Date(
      `${month}-01T00:00:00Z`,
    );

    cell.textContent =
      new Intl.DateTimeFormat(
        "en-GB",
        {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        },
      ).format(date);

    header.appendChild(cell);
  }

  body.replaceChildren();

  body.appendChild(
    createMonthlyRow(
      "Forecast Units",
      "forecast_unit",
      months,
      recordsByMonth,
    ),
  );

  body.appendChild(
    createMonthlyRow(
      "Forecast $",
      "forecast_dollars",
      months,
      recordsByMonth,
    ),
  );

  body.appendChild(
    createMonthlyRow(
      "Local ASP ($)",
      "local_asp_usd",
      months,
      recordsByMonth,
    ),
  );
}


/**
 * Create one monthly input row.
 *
 * @param {string} label - Row label.
 * @param {string} field - API field.
 * @param {string[]} months - Fiscal months.
 * @param {Map} recordsByMonth - Records by month.
 * @returns {HTMLTableRowElement} Table row.
 */
function createMonthlyRow(
  label,
  field,
  months,
  recordsByMonth,
) {
  const row =
    document.createElement("tr");

  const heading =
    document.createElement("th");

  heading.scope = "row";
  heading.textContent = label;

  row.appendChild(heading);

  months.forEach(
    (month, index) => {
      const record =
        recordsByMonth.get(month);

      const cell =
        document.createElement("td");

      const input =
        document.createElement("input");

      input.type = "text";

      if (!record) {
        input.value = "—";
        input.disabled = true;
      } else {
        const possibleFields =
          field === "forecast_unit"
            ? [
                "forecast_unit",
                "forecast_units",
              ]
            : [field];

        const value = numberValue(
          valueAt(
            record,
            possibleFields,
          ),
        );

        input.value =
          field === "local_asp_usd"
            ? value.toFixed(4)
            : numberFormatter.format(
                value,
              );

        if (
          field ===
          "forecast_dollars"
        ) {
          input.readOnly = true;
        } else {
          input.addEventListener(
            "input",
            () => {
              markMonthChanged(
                index,
                record,
              );
            },
          );
        }
      }

      cell.appendChild(input);
      row.appendChild(cell);
    },
  );

  return row;
}


/**
 * Recalculate dollars and record an edited month.
 *
 * @param {number} index - Month column.
 * @param {object} record - Original monthly record.
 */
function markMonthChanged(
  index,
  record,
) {
  const body =
    $("#forecast-month-body");

  const unitsInput =
    body.rows[0]
      .cells[index + 1]
      .querySelector("input");

  const dollarsInput =
    body.rows[1]
      .cells[index + 1]
      .querySelector("input");

  const aspInput =
    body.rows[2]
      .cells[index + 1]
      .querySelector("input");

  const units = numberValue(
    unitsInput.value,
  );

  const asp = numberValue(
    aspInput.value,
  );

  const recordId = valueAt(
    record,
    ["s_id", "id", "pk"],
    null,
  );

  dollarsInput.value =
    numberFormatter.format(
      units * asp,
    );

  unitsInput.classList.add(
    "is-dirty",
  );

  aspInput.classList.add(
    "is-dirty",
  );

  if (
    recordId !== null &&
    recordId !== ""
  ) {
    state.changed.set(
      String(recordId),
      {
        s_id: recordId,
        forecast_unit: units,
        local_asp_usd: asp,
      },
    );
  }

  showStatus(
    `${state.changed.size} month(s) ` +
    "have unsaved changes.",
  );
}


/**
 * Save the edited monthly records.
 *
 * @returns {Promise<void>}
 */

function setSaveButtonsDisabled(disabled) {
  document
    .querySelectorAll(
      '[data-action="save-forecast"]',
    )
    .forEach((button) => {
      button.disabled = disabled;
    });
}
async function saveForecast() {
  if (!state.selected) {
    showStatus(
      "Select a summary row first.",
      true,
    );

    return;
  }

  const updates = [
    ...state.changed.values(),
  ];

  if (updates.length === 0) {
    showStatus(
      "There are no changes to save.",
    );

    return;
  }

  const invalid = updates.some(
    (update) =>
      update.forecast_unit < 0 ||
      update.local_asp_usd < 0,
  );

  if (invalid) {
    showStatus(
      "Forecast units and local ASP cannot be negative.",
      true,
    );

    return;
  }

  const parameters =
    new URLSearchParams({
      fiscal_year: String(fiscalYear()),
    });

  setSaveButtonsDisabled(true);
  showStatus("Saving forecast...");

  try {
    await apiRequest(
      `${API.detail(
        state.selected.productId,
        state.selected.customerId,
      )}?${parameters}`,
      {
        method: "PATCH",

        body: JSON.stringify({
          updates,
        }),
      },
    );

    const selected =
      state.selected;

    state.changed.clear();

    await selectSummaryRow(selected);

    showStatus(
      "Forecast saved successfully.",
    );
  } finally {
    setSaveButtonsDisabled(false);
  }
}


/**
 * Export filtered summary data as CSV.
 */
function exportCsv() {
  const headings = [
    "Product ID",
    "Product Name",
    "Customer ID",
    "Customer Name",
    "Region",
    "Plan Units",
    "Plan Dollars",
    "Billings Units",
    "Billings Dollars",
    "Backlog Units",
    "Backlog Dollars",
  ];

  const rows =
    state.filtered.map((row) => [
      row.productId,
      row.productName,
      row.customerId,
      row.customerName,
      row.region,
      row.planUnits,
      row.planDollars,
      row.billingsUnits,
      row.billingsDollars,
      row.backlogUnits,
      row.backlogDollars,
    ]);

  const csv = [
    headings,
    ...rows,
  ]
    .map((row) =>
      row
        .map((value) =>
          `"${String(value ?? "")
            .replaceAll('"', '""')}"`,
        )
        .join(","),
    )
    .join("\r\n");

  const blob = new Blob(
    [csv],
    {
      type:
        "text/csv;charset=utf-8",
    },
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    `forecast-summary-FY${
      String(fiscalYear()).slice(-2)
    }.csv`;

  document.body.appendChild(link);

  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}


/**
 * Clear all filters.
 */
function resetFilters() {
  $("#product-id").value = "";
  $("#customer-id").value = "";
  $("#region").value = "";

  $("#business-opportunities").value =
    "";

  state.page = 1;

  applyFilters();
}


/**
 * Connect page controls.
 */
function connectEvents() {
  $("#product-id")?.addEventListener(
    "input",
    () => {
      state.page = 1;
      applyFilters();
    },
  );

  $("#customer-id")?.addEventListener(
    "input",
    () => {
      state.page = 1;
      applyFilters();
    },
  );

  $("#region")?.addEventListener(
    "change",
    () => {
      state.page = 1;
      applyFilters();
    },
  );

  $("#business-opportunities")
    ?.addEventListener(
      "change",
      () => {
        state.page = 1;
        applyFilters();
      },
    );

  $("#fiscal-year")?.addEventListener(
    "change",
    () => {
      void loadSummary().catch(
        (error) => {
          showStatus(
            error.message,
            true,
          );

          console.error(error);
        },
      );
    },
  );

  $("#rows-per-page")
    ?.addEventListener(
      "change",
      (event) => {
        state.pageSize =
          Number(
            event.target.value,
          ) || 10;

        state.page = 1;

        renderSummary();
      },
    );

  $("#reset-filters-button")
    ?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        resetFilters();
      },
    );

  $("#export-button")
    ?.addEventListener(
      "click",
      exportCsv,
    );

  document
    .querySelectorAll(
      '[data-action="save-forecast"]',
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          void saveForecast().catch(
            (error) => {
              showStatus(
                error.message,
                true,
              );

              console.error(error);
            },
          );
        },
      );
    });
}


/**
 * Initialise the frontend.
 *
 * @returns {Promise<void>}
 */
async function start() {
  connectEvents();

  await loadCustomers();

  try {
    await loadSummary();
  } catch (error) {
    showStatus(
      error.message,
      true,
    );

    console.error(error);
  }
}


document.addEventListener(
  "DOMContentLoaded",
  () => {
    void start();
  },
);