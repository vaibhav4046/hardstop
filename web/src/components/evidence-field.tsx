// Beyond the one test: two other controlled tests, the losses on record,
// and how much agent payment traffic there is. Each chart has a table view.
// Figures from different sources are never added together.

import {
  AGENTIC_SHARE,
  INCIDENTS,
  OTHER_TESTS,
  X402_MONTHS,
  sourceById,
} from "@/lib/evidence";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const COUNT = new Intl.NumberFormat("en-US");
const MILLIONS = (value: number) =>
  `${(value / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const Cite = ({ id }: { id: string }) => {
  const source = sourceById(id);
  return (
    <a href={source.url} rel="noopener noreferrer">
      {source.publisher}
    </a>
  );
};

export function OtherTests() {
  const { zscaler, aport } = OTHER_TESTS;
  return (
    <div className="figures reveal">
      <figure className="figure-block">
        <p className="figures-number">
          <span className="text-stop">{zscaler.paid}</span> of {zscaler.models}
        </p>
        <figcaption>
          AI models made a payment after reading hidden instructions taken from
          real scam websites. In a sandbox with no real money, and the agent had
          no spending limit at all. <Cite id={zscaler.source} />.
        </figcaption>
      </figure>
      <figure className="figure-block">
        <p className="figures-number">
          <span className="text-stop">
            {COUNT.format(aport.unpermittedAlone)}
          </span>
          <span className="figures-versus"> against </span>
          <span className="text-paid">{aport.unpermittedChecked}</span>
        </p>
        <figcaption>
          Payments to a forbidden recipient when agents policed themselves (
          {COUNT.format(aport.runsAlone)} runs), and when a check outside the
          model decided ({COUNT.format(aport.runsChecked)} runs). The author
          sells that check, a declared conflict of interest.{" "}
          <Cite id={aport.source} />.
        </figcaption>
      </figure>
    </div>
  );
}

export function Incidents() {
  const top = Math.max(...INCIDENTS.map((incident) => incident.high));
  return (
    <figure className="incidents reveal">
      <ol>
        {INCIDENTS.map((incident, index) => (
          <li key={incident.id}>
            <p className="incidents-when">
              {MONTH.format(new Date(`${incident.when}-01T00:00:00Z`))}
            </p>
            <div className="incidents-row">
              <div className="incidents-track" aria-hidden="true">
                <span
                  className="incidents-bar"
                  style={{
                    width: `${(incident.low / top) * 100}%`,
                    animationDelay: `${index * 120}ms`,
                  }}
                />
                {incident.high > incident.low && (
                  <span
                    className="incidents-range"
                    style={{
                      left: `${(incident.low / top) * 100}%`,
                      width: `${((incident.high - incident.low) / top) * 100}%`,
                    }}
                  />
                )}
              </div>
              <p className="incidents-amount">
                {incident.high > incident.low
                  ? `${USD.format(incident.low)} to ${USD.format(incident.high)}`
                  : USD.format(incident.low)}
              </p>
            </div>
            <p className="incidents-what">
              <strong>{incident.name}.</strong> {incident.what}{" "}
              <Cite id={incident.id} />.
            </p>
          </li>
        ))}
      </ol>
      <details className="disclosure mt-6">
        <summary>Show as a table</summary>
        <div className="table-scroll mt-4">
          <table className="ledger min-w-[34rem]">
            <caption className="sr-only">
              Recorded losses involving AI agents, oldest first
            </caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Value, US dollars</th>
                <th scope="col">What happened</th>
              </tr>
            </thead>
            <tbody>
              {INCIDENTS.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    {MONTH.format(new Date(`${incident.when}-01T00:00:00Z`))}
                  </td>
                  <th scope="row">{incident.name}</th>
                  <td>
                    {incident.high > incident.low
                      ? `${USD.format(incident.low)} to ${USD.format(incident.high)}`
                      : USD.format(incident.low)}
                  </td>
                  <td>{incident.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <figcaption className="small soft mt-4">
        Four separate events, each happening a different way, so they are not
        added up. Values are as each report gives them; two are prices on thinly
        traded tokens. A spending limit would not have stopped every one of
        them: a leaked key, for example, is a different failure.
      </figcaption>
    </figure>
  );
}

export function Adoption() {
  const top = Math.max(...X402_MONTHS.map((month) => month.payments));
  return (
    <figure className="adoption reveal">
      <div className="adoption-bars" aria-hidden="true">
        {X402_MONTHS.map((month, index) => (
          <div key={month.month} className="adoption-column">
            <p className="adoption-value">{MILLIONS(month.payments)}</p>
            <div className="adoption-track">
              <span
                style={{
                  height: `${(month.payments / top) * 100}%`,
                  animationDelay: `${index * 110}ms`,
                }}
              />
            </div>
            <p className="adoption-month">{month.month}</p>
          </div>
        ))}
      </div>
      <details className="disclosure mt-6">
        <summary>Show as a table</summary>
        <div className="table-scroll mt-4">
          <table className="ledger">
            <caption className="sr-only">Payments over x402 by month</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Payments</th>
                <th scope="col">Value, US dollars</th>
              </tr>
            </thead>
            <tbody>
              {X402_MONTHS.map((month) => (
                <tr key={month.month}>
                  <th scope="row">{month.month}</th>
                  <td>{COUNT.format(month.payments)}</td>
                  <td>{USD.format(month.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <figcaption className="small soft mt-4">
        Payments a month over x402, a payment standard built for AI agents. The
        source gives these four months; the late 2025 peak was a token craze.
        Most of this traffic is scripts, not agents: only {AGENTIC_SHARE.low}%
        to {AGENTIC_SHARE.high}% of it appears to come from AI agents (
        <Cite id={AGENTIC_SHARE.source} />
        ). Monthly figures: <Cite id="fireblocks-x402" />.
      </figcaption>
    </figure>
  );
}
