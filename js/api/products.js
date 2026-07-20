/* FinCraft · api/products.js — Product configuration: loan, savings, share, fixed/recurring deposit products, product mix, floating rates.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeLoanProductsAPI(self) {
  return {
      list:     ()       => self._g('/loanproducts'),
      get:      (id)     => self._g(`/loanproducts/${id}`),
      template: (params) => self._g('/loanproducts/template', params),
      create:   (b)      => self._p('/loanproducts', b),
      update:   (id, b)  => self._u(`/loanproducts/${id}`, b)
      // No delete() — LoanProductsApiResource exposes POST/GET/PUT only, no DELETE, per Fineract source.
    };
}

export function makeSavingsProductsAPI(self) {
  return {
      list:     ()       => self._g('/savingsproducts'),
      get:      (id)     => self._g(`/savingsproducts/${id}`),
      template: (params) => self._g('/savingsproducts/template', params),
      create:   (b)      => self._p('/savingsproducts', b),
      update:   (id, b)  => self._u(`/savingsproducts/${id}`, b),
      delete:   (id)     => self._d(`/savingsproducts/${id}`)
    };
}

export function makeShareProductsAPI(self) {
  return {
    list:     ()       => self._g('/products/share'),
    get:      (id)     => self._g(`/products/share/${id}`),
    template: (params) => self._g('/products/share/template', params),
    create:   (b)      => self._p('/products/share', b),
    update:   (id, b)  => self._u(`/products/share/${id}`, b),
    delete:   (id)     => self._d(`/products/share/${id}`)
  };
}

export function makeFdProductsAPI(self) {
  return {
    list:     ()       => self._g('/fixeddepositproducts'),
    get:      (id)     => self._g(`/fixeddepositproducts/${id}`),
    template: (params) => self._g('/fixeddepositproducts/template', params),
    create:   (b)      => self._p('/fixeddepositproducts', b),
    update:   (id, b)  => self._u(`/fixeddepositproducts/${id}`, b),
    delete:   (id)     => self._d(`/fixeddepositproducts/${id}`)
  };
}

export function makeRdProductsAPI(self) {
  return {
    list:     ()       => self._g('/recurringdepositproducts'),
    get:      (id)     => self._g(`/recurringdepositproducts/${id}`),
    template: (params) => self._g('/recurringdepositproducts/template', params),
    create:   (b)      => self._p('/recurringdepositproducts', b),
    update:   (id, b)  => self._u(`/recurringdepositproducts/${id}`, b),
    delete:   (id)     => self._d(`/recurringdepositproducts/${id}`)
  };
}

export function makeProductMixAPI(self) {
  return {
      list:     ()       => self._g('/loanproducts'),  // products with productMixes association
      get:      (id)     => self._g(`/loanproducts/${id}/productmix`),
      // No separate /template sub-path exists on ProductMixApiResource — GET/POST/PUT/DELETE all share the same
      // bare path. This is currently unused (openProductMixModal uses loanProducts.list() + productMix.get()
      // instead) but aliased to the real endpoint rather than left pointing at a 404.
      template: (id)     => self._g(`/loanproducts/${id}/productmix`),
      create:   (id, b)  => self._p(`/loanproducts/${id}/productmix`, b),
      update:   (id, b)  => self._u(`/loanproducts/${id}/productmix`, b),
      delete:   (id)     => self._d(`/loanproducts/${id}/productmix`)
    };
}

export function makeFloatingRatesAPI(self) {
  return {
      list:   ()        => self._g('/floatingrates'),
      get:    (id)      => self._g(`/floatingrates/${id}`),
      create: (b)       => self._p('/floatingrates', b),
      update: (id, b)   => self._u(`/floatingrates/${id}`, b)
      // No delete() — FloatingRatesApiResource exposes POST/GET/PUT only, no DELETE, per Fineract source.
    };
}

export function makeRatesAPI(self) {
  return {
      list:   ()        => self._g('/rates'),
      get:    (id)      => self._g(`/rates/${id}`),
      create: (b)       => self._p('/rates', b),
      update: (id, b)   => self._u(`/rates/${id}`, b)
      // No delete() — RateApiResource exposes POST/GET/PUT only, no DELETE, and there's no
      // DELETE_RATE permission in fineract_permissions_raw.json either — same situation as
      // Floating Rate above.
    };
}
