import { expect, it } from "vitest";
import { makeCategory, makeContainer, makeGeneralContainer } from "@/core/model";
import { watchSubjectOptions } from "./watch-subjects";

it("offers active containers and only stats-visible expense categories", () => {
  const general = makeGeneralContainer();
  const archivedContainer = {
    ...makeContainer({ id: "old", name: "Old" }),
    is_archived: true,
  };
  const expense = makeCategory({ id: "food", name: "Food", type: "expense" });
  const income = makeCategory({ id: "pay", name: "Pay", type: "income" });
  const hidden = {
    ...makeCategory({ id: "hidden", name: "Hidden", type: "expense" }),
    excluded_from_stats: true,
  };
  const archivedCategory = {
    ...makeCategory({ id: "old-food", name: "Old food", type: "expense" }),
    is_archived: true,
  };

  expect(
    watchSubjectOptions("container", [general, archivedContainer], [expense]),
  ).toEqual([{ id: general.id, name: general.name }]);
  expect(
    watchSubjectOptions(
      "category",
      [general],
      [expense, income, hidden, archivedCategory],
    ),
  ).toEqual([{ id: expense.id, name: expense.name }]);
});
