# Fix Command

Analyze the given error:

1. Identify which package is affected: core / server / metro-plugin / ui
2. Examine the error message and stack trace
3. Fix the relevant file
4. If packages/ui was changed, remind:
   cd packages/ui && npm run build
5. If Metro cache needs clearing: yarn start --reset-cache
