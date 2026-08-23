import { previewsFor, previewUrl } from '@/lib/catalog';

/**
 * Shop images for a product page.
 *
 * Interior shots are top crops rather than whole pages — on these guides the
 * reference page is the product, so a full legible preview would remove the
 * reason to buy. The fade at the cut edge makes that read as a deliberate
 * teaser rather than a broken image.
 */
export function PreviewGallery({ sku, name }: { sku: string; name: string }) {
  const previews = previewsFor(sku);
  if (previews.length === 0) return null;

  const [cover, ...interior] = previews;

  return (
    <figure className="gallery">
      <img
        className="gallery__cover"
        src={previewUrl(cover)}
        alt={`Cover of ${name}`}
        width={cover.width}
        height={Math.round(cover.width * 0.75)}
        loading="eager"
      />

      {interior.length > 0 && (
        <div className="gallery__pages">
          {interior.map((preview) => (
            <div className="gallery__page" key={preview.name}>
              <img
                src={previewUrl(preview)}
                alt={`Page ${preview.page} of ${name} — ${preview.heading}`}
                width={preview.width}
                height={Math.round(preview.width * 0.65)}
                loading="lazy"
              />
              <span className="gallery__label">
                p{preview.page} · {preview.heading}
              </span>
            </div>
          ))}
        </div>
      )}

      <figcaption className="gallery__note">
        Previews are generated from the finished PDF. Interior pages are shown in
        part.
      </figcaption>
    </figure>
  );
}

/**
 * The single shot used on listing cards.
 *
 * An interior page, not the cover: the card already prints the title as its
 * heading, so a cover thumbnail says the same thing twice at a size where
 * neither is legible. A page of real content shows what is actually being sold.
 */
export function PreviewThumb({ sku, name }: { sku: string; name: string }) {
  const shots = previewsFor(sku);
  const shot = shots.find((preview) => preview.kind === 'page') ?? shots[0];
  if (!shot) return null;

  return (
    <img
      className="card__preview"
      src={previewUrl(shot)}
      alt={`A page from ${name}`}
      width={shot.width}
      height={Math.round(shot.width * 0.75)}
      loading="lazy"
    />
  );
}
