# UI Build

Run after making changes to the UI:

cd packages/ui && npm run build && cp -r dist/* ../server/public/

Then restart Metro:
yarn start --reset-cache
