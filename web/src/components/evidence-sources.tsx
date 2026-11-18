// Where every figure on the page comes from, with what each source does not
// show. Set as a reference list, not as cards.

import { SOURCES, type Category } from '@/lib/evidence'

const ORDER: { category: Category; heading: string }[] = [
  { category: 'controlled test', heading: 'Controlled tests' },
  { category: 'recorded incident', heading: 'Recorded incidents' },
  { category: 'adoption signal', heading: 'Signs that agents are being given money' },
  { category: 'how limits are raised today', heading: 'How a limit is raised today' },
]

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function EvidenceSources() {
  return (
    <div className="sources">
      {ORDER.map(({ category, heading }) => {
        const found = SOURCES.filter((source) => source.category === category)
        if (found.length === 0) return null
        return (
          <section key={category} aria-label={heading}>
            <h3 className="sources-heading">{heading}</h3>
            <ul>
              {found.map((source) => (
                <li key={source.id}>
                  <p className="sources-from">
                    {source.publisher}
                    {source.published ? `, ${DATE.format(new Date(source.published))}` : ''}
                  </p>
                  <div>
                    <p className="sources-finding">{source.finding}</p>
                    <p className="small soft mt-2">{source.limit}</p>
                    <p className="small sources-link mt-1">
                      <a href={source.url} rel="noopener noreferrer">
                        {source.title}
                      </a>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <p className="small soft">
        Not used anywhere on this site: totals for crypto theft across the whole industry. Those are not losses caused
        by AI agents, and quoting them here would overstate the problem.
      </p>
    </div>
  )
}
