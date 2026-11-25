import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

export const handler = async (_e: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ status: "ok" }),
});
