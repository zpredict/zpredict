# brand

zPredict logo and icons, shared by `apps/landing` and `apps/web`.

- `black/`: for light backgrounds. Also holds the default `favicon.ico`.
- `white/`: for dark backgrounds.

Favicon that follows the browser theme:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon-32x32.png" media="(prefers-color-scheme: light)">
<link rel="icon" href="/white/favicon-32x32.png" media="(prefers-color-scheme: dark)">
```
