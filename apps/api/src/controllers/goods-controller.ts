import { goodsService } from "../services/goods-service.ts";

export const goodsController = {
  search(request, response) {
    const result = goodsService.search(request.url ?? "");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(result));
  },

  getById(request, response) {
    try {
      const id = request.url?.split("/").pop() ?? "";
      const result = goodsService.getById(id);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = error.statusCode ?? 500;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error: error.message ?? "Unknown error"
        })
      );
    }
  }
};
