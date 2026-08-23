import type { Metadata } from 'next';
import { merchant, singles } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'About',
  description: `What ${merchant.name} publishes, and the rule every guide is written to.`,
};

export default function AboutPage() {
  return (
    <div className="wrap prose">
      <h1>About</h1>

      <p>
        {merchant.name} publishes printable reference guides for hobbies with a
        troubleshooting problem — where the thing you are doing goes wrong in a handful
        of predictable ways, and the fix depends on telling those ways apart.
      </p>

      <h2>The rule every guide is written to</h2>
      <p>
        <strong>Say what will not work.</strong> A guide that only lists things to try
        sends you round a loop. Each of these says which fixes are reliable, which
        depend entirely on your equipment, and which are purchases rather than
        adjustments — so you can stop chasing a change that was never available to you.
      </p>

      <h2>Built to be printed</h2>
      <p>
        Every guide has one page that is the actual product — the card, the chart, the
        recipe block. That page is laid out for high contrast with no background wash,
        checked in greyscale, and meant to be pinned up next to the machine, the desk,
        or the painting table. The remaining pages exist to stop that page being
        misread.
      </p>

      <h2>What is in the catalogue</h2>
      <ul>
        {singles.map((item) => (
          <li key={item.sku}>
            <strong>{item.name}</strong> — {item.blurb}
          </li>
        ))}
      </ul>

      <h2>Getting in touch</h2>
      <p>
        Problems with a download, a question before buying, or a correction to something
        in a guide: <a href={`mailto:${merchant.supportEmail}`}>{merchant.supportEmail}</a>.
        Corrections especially — these get updated, and buyers get the new version.
      </p>
    </div>
  );
}
