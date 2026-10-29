/** Shared formatting, request, escaping, and select utilities for both pages. */
(() => {
    "use strict";

    const unitsFormatter =
        new Intl.NumberFormat(
            "en-US",
            {
                maximumFractionDigits: 0,
            }
        );

    const usdFormatter =
        new Intl.NumberFormat(
            "en-US",
            {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 2,
            }
        );


    function isMissing(value) {
        return (
            value === null
            || value === undefined
            || value === ""
        );
    }


    function dash(value) {
        return isMissing(value)
            ? "—"
            : value;
    }


    function formatUnits(value) {
        if (isMissing(value)) {
            return "—";
        }

        const number =
            Number(value);

        if (!Number.isFinite(number)) {
            return "—";
        }

        return unitsFormatter.format(
            number
        );
    }


    function formatUsd(value) {
        if (isMissing(value)) {
            return "—";
        }

        const number =
            Number(value);

        if (!Number.isFinite(number)) {
            return "—";
        }

        const abs =
            Math.abs(number);

        if (abs >= 1_000_000_000) {
            return (
                `$${(
                    number
                    / 1_000_000_000
                ).toFixed(2)}B`
            );
        }

        if (abs >= 1_000_000) {
            return (
                `$${(
                    number
                    / 1_000_000
                ).toFixed(2)}M`
            );
        }

        if (abs >= 1_000) {
            return (
                `$${(
                    number
                    / 1_000
                ).toFixed(1)}K`
            );
        }

        return usdFormatter.format(
            number
        );
    }


    function formatDate(value) {
        if (isMissing(value)) {
            return "—";
        }

        const parsed =
            new Date(value);

        if (
            Number.isNaN(
                parsed.getTime()
            )
        ) {
            return "—";
        }

        return new Intl.DateTimeFormat(
            "en-GB",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            }
        ).format(parsed);
    }


    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll(
                "'",
                "&#039;"
            );
    }


    function parseNumber(value) {
        if (
            value === null
            || value === undefined
        ) {
            return null;
        }

        const cleaned =
            String(value)
                .replace(
                    /[$,\s]/g,
                    ""
                )
                .trim();

        if (cleaned === "") {
            return null;
        }

        const number =
            Number(cleaned);

        return Number.isFinite(number)
            ? number
            : null;
    }


    function debounce(
        callback,
        delay = 350
    ) {
        let timeout;

        return (...args) => {
            clearTimeout(timeout);

            timeout =
                setTimeout(
                    () => callback(...args),
                    delay
                );
        };
    }


    function csrfToken() {
        const cookie =
            document.cookie
                .split(";")
                .map(
                    (item) =>
                        item.trim()
                )
                .find(
                    (item) =>
                        item.startsWith(
                            "csrftoken="
                        )
                );

        if (!cookie) {
            return "";
        }

        return decodeURIComponent(
            cookie.slice(
                "csrftoken=".length
            )
        );
    }


    /**
     * Request a same-origin endpoint and normalize JSON/error handling.
     * Mutating requests automatically receive Django's CSRF cookie value.
     */
    async function requestJson(
        url,
        options = {}
    ) {
        const method =
            String(
                options.method
                || "GET"
            ).toUpperCase();

        const headers =
            new Headers(
                options.headers
                || {}
            );

        headers.set(
            "Accept",
            "application/json"
        );

        let body =
            options.body;

        if (
            body !== undefined
            && body !== null
            && typeof body !== "string"
            && !(body instanceof FormData)
        ) {
            headers.set(
                "Content-Type",
                "application/json"
            );

            body =
                JSON.stringify(body);
        }

        if (
            ![
                "GET",
                "HEAD",
                "OPTIONS",
            ].includes(method)
        ) {
            const token =
                csrfToken();

            if (token) {
                headers.set(
                    "X-CSRFToken",
                    token
                );
            }
        }

        const response =
            await fetch(
                url,
                {
                    credentials:
                        "same-origin",

                    ...options,

                    method,
                    headers,
                    body,
                }
            );

        const contentType =
            response.headers.get(
                "content-type"
            ) || "";

        const payload =
            contentType.includes(
                "application/json"
            )
                ? await response.json()
                : await response.text();

        if (!response.ok) {
            const message =
                (
                    typeof payload
                    === "object"
                )
                    ? (
                        payload.error
                        || payload.detail
                        || payload.message
                    )
                    : payload;

            throw new Error(
                message
                || `HTTP ${response.status}`
            );
        }

        return payload;
    }


    /** Replace a filter's options while preserving a still-valid selection. */
    function populateSelect(
        select,
        values,
        firstLabel
    ) {
        if (!select) {
            return;
        }

        const currentValue =
            select.value;

        const uniqueValues =
            [
                ...new Set(
                    values.filter(Boolean)
                ),
            ].sort(
                (a, b) =>
                    a.localeCompare(b)
            );

        select.replaceChildren();

        const firstOption =
            document.createElement(
                "option"
            );

        firstOption.value = "";
        firstOption.textContent =
            firstLabel;

        select.appendChild(
            firstOption
        );

        for (
            const value
            of uniqueValues
        ) {
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

        if (
            uniqueValues.includes(
                currentValue
            )
        ) {
            select.value =
                currentValue;
        }
    }


    window.PlanningUI =
        Object.freeze({
            isMissing,
            dash,
            formatUnits,
            formatUsd,
            formatDate,
            escapeHtml,
            parseNumber,
            debounce,
            requestJson,
            populateSelect,
        });
})();
