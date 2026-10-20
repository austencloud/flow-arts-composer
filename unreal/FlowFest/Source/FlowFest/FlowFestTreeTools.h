#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "FlowFestTreeTools.generated.h"

class USkeletalMesh;
class UStaticMesh;

/** Editor helpers behind Tools/grow-trees.py (README "Trees"). */
UCLASS()
class UFlowFestTreeTools : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()

public:
    /**
     * Gives a static mesh the Nanite leaf assembly of a Megaplants skeletal mesh, so the far tree keeps its
     * leaves. The static mesh's material slots must match the skeletal mesh's. Editor only; returns false in a
     * cooked game or when the skeletal mesh has no assembly.
     */
    UFUNCTION(BlueprintCallable, Category = "Flow Fest|Trees")
    static bool CopyNaniteAssembly(USkeletalMesh* From, UStaticMesh* To);

    /** Waits for every pending static mesh build, so a commandlet can exit without tripping the compiler's shutdown assert. */
    UFUNCTION(BlueprintCallable, Category = "Flow Fest|Trees")
    static void FinishMeshCompilation();
};
