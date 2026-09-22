## Development

```bash
pnpm dev
```

Open [http://localhost:3000/en](http://localhost:3000/en) or
[http://localhost:3000/es](http://localhost:3000/es). The root route resolves a locale and
redirects to a locale-aware route.

Set `NEXT_PUBLIC_ARDENFOLD_FALLBACK_LOCALE` to `en` or `es` in a deployment environment. It is a
technical fallback, not a permanent product language. See
[localization.md](../../docs/development/localization.md) for resolution and content rules.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
