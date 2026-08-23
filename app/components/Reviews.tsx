import type { Review, Rating } from '@/lib/catalog';
import { merchant } from '@/lib/catalog';
import { Icon } from './Icon';

/**
 * Customer reviews.
 *
 * There is deliberately no placeholder content and no "5.0 from 0 reviews".
 * A new shop has no reviews, and inventing them is illegal under the UK DMCC
 * Act and the FTC's reviews rule — quite apart from being indefensible for a
 * range that sells on telling people what will not work.
 *
 * Until real ones arrive the section says so plainly, which readers find far
 * more credible than a suspiciously perfect wall of five stars.
 */
export function Reviews({
  reviews,
  rating,
  productName,
}: {
  reviews: Review[];
  rating: Rating | null;
  productName: string;
}) {
  if (reviews.length === 0) {
    return (
      <section className="reviews">
        <h2>Reviews</h2>
        <div className="reviews__empty">
          <p>
            None yet — this guide is newly published. Rather than fill the space
            with something invented, here is what you can check instead: the
            preview above is generated from the finished PDF, so it is exactly
            what you receive, and the page count on the listing is verified
            automatically on every release.
          </p>
          <p style={{ marginBottom: 0 }}>
            If you buy it, tell me what you thought —{' '}
            <a href={`mailto:${merchant.supportEmail}?subject=${encodeURIComponent(`Review: ${productName}`)}`}>
              {merchant.supportEmail}
            </a>
            . Good or bad, it goes up with your permission.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="reviews">
      <div className="reviews__head">
        <h2>Reviews</h2>
        {rating && (
          <p className="reviews__rating">
            <Stars value={Math.round(rating.average)} />
            <strong>{rating.average.toFixed(1)}</strong>
            <span>from {rating.count} {rating.count === 1 ? 'review' : 'reviews'}</span>
          </p>
        )}
      </div>

      <ul className="reviews__list">
        {reviews.map((review, index) => (
          <li key={`${review.author}-${index}`}>
            <div className="review__head">
              <Stars value={review.rating} />
              {review.verified && (
                <span className="review__verified">
                  <Icon name="check" size={11} /> Verified purchase
                </span>
              )}
            </div>
            <p className="review__text">{review.text}</p>
            <p className="review__by">
              {review.author}
              {review.location ? ` · ${review.location}` : ''}
              {review.date ? ` · ${formatDate(review.date)}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stars({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="stars" role="img" aria-label={`${safe} out of 5`}>
      {'★'.repeat(safe)}
      <span className="stars__empty">{'★'.repeat(5 - safe)}</span>
    </span>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
