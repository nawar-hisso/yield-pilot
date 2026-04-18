"use client";

import { Users, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { EmptyState } from "../shared/EmptyState";
import { short } from "../../lib/utils";

type Operator = { address: string; addedAt: number };

const OPERATORS: Operator[] = [];

export function OperatorList() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardDescription>
            Operators can execute `executeStrategy` through your Safe — bounded by the Guard.
          </CardDescription>
        </div>
        <Button size="sm" disabled>
          <Plus className="mr-1.5 h-4 w-4" />
          Add operator
        </Button>
      </CardHeader>
      <CardContent>
        {OPERATORS.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No operators yet"
            description="Add a trusted EOA so it can call YieldVault.deposit / MockAave.supply through your Safe — but only those selectors, bounded by the Guard."
          />
        ) : (
          <ul className="divide-y divide-border">
            {OPERATORS.map((op) => (
              <li key={op.address} className="flex items-center justify-between py-3">
                <div className="font-mono text-sm">{short(op.address)}</div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(op.addedAt).toLocaleDateString()}
                  </span>
                  <Button size="sm" variant="outline" disabled>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
